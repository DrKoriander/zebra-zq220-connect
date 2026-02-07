package com.zebraprinter

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class BluetoothPairingModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "BluetoothPairingModule"
        private const val TAG = "BluetoothPairing"
    }

    override fun getName(): String = NAME

    private val bluetoothManager: BluetoothManager? by lazy {
        reactContext.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    }

    private val bluetoothAdapter: BluetoothAdapter? by lazy {
        bluetoothManager?.adapter
    }

    private var pairingPin: String = "0000"
    private var isDiscovering = false

    private val discoveryReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                BluetoothDevice.ACTION_FOUND -> {
                    val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                    }
                    device?.let { handleDeviceFound(it) }
                }
                BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
                    isDiscovering = false
                    sendEvent("onDiscoveryFinished", null)
                }
            }
        }
    }

    private val pairingReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                BluetoothDevice.ACTION_PAIRING_REQUEST -> {
                    val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                    }
                    val variant = intent.getIntExtra(BluetoothDevice.EXTRA_PAIRING_VARIANT, -1)
                    Log.d(TAG, "Pairing request received: device=${device?.address}, variant=$variant")

                    device?.let {
                        try {
                            when (variant) {
                                0 -> {
                                    it.setPin(pairingPin.toByteArray())
                                    Log.d(TAG, "PIN set to $pairingPin for ${it.address}")
                                    abortBroadcast()
                                }
                                2 -> {
                                    it.setPairingConfirmation(true)
                                    Log.d(TAG, "Passkey confirmation set for ${it.address}")
                                    abortBroadcast()
                                }
                                3 -> {
                                    it.setPairingConfirmation(true)
                                    Log.d(TAG, "Consent confirmation set for ${it.address}")
                                    abortBroadcast()
                                }
                                else -> {
                                    Log.w(TAG, "Unknown pairing variant: $variant")
                                }
                            }
                        } catch (e: Exception) {
                            Log.e(TAG, "Error handling pairing request", e)
                        }
                    }
                }
                BluetoothDevice.ACTION_BOND_STATE_CHANGED -> {
                    val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
                    }
                    val bondState = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.BOND_NONE)
                    val prevState = intent.getIntExtra(BluetoothDevice.EXTRA_PREVIOUS_BOND_STATE, BluetoothDevice.BOND_NONE)

                    Log.d(TAG, "Bond state changed: device=${device?.address}, prev=$prevState, new=$bondState")

                    device?.let {
                        val params = Arguments.createMap().apply {
                            putString("address", it.address)
                            putString("name", it.name ?: "Unknown")
                            putInt("bondState", bondState)
                        }
                        when (bondState) {
                            BluetoothDevice.BOND_BONDED -> {
                                sendEvent("onPairingSuccess", params)
                            }
                            BluetoothDevice.BOND_NONE -> {
                                if (prevState == BluetoothDevice.BOND_BONDING) {
                                    sendEvent("onPairingFailed", params)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    override fun initialize() {
        super.initialize()
        registerPairingReceiver()
    }

    @Suppress("MissingPermission")
    private fun registerPairingReceiver() {
        val pairingFilter = IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_PAIRING_REQUEST)
            addAction(BluetoothDevice.ACTION_BOND_STATE_CHANGED)
            priority = IntentFilter.SYSTEM_HIGH_PRIORITY
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactContext.registerReceiver(pairingReceiver, pairingFilter, Context.RECEIVER_EXPORTED)
        } else {
            reactContext.registerReceiver(pairingReceiver, pairingFilter)
        }
        Log.d(TAG, "Pairing receiver registered")
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        try {
            if (isDiscovering) {
                bluetoothAdapter?.cancelDiscovery()
            }
            reactContext.unregisterReceiver(discoveryReceiver)
        } catch (_: Exception) {}
        try {
            reactContext.unregisterReceiver(pairingReceiver)
        } catch (_: Exception) {}
    }

    @Suppress("MissingPermission")
    private fun handleDeviceFound(device: BluetoothDevice) {
        try {
            val name = device.name ?: "Unknown"
            Log.d(TAG, "Device found: $name (${device.address})")

            val params = Arguments.createMap().apply {
                putString("address", device.address)
                putString("name", name)
                putInt("bondState", device.bondState)
            }
            sendEvent("onDeviceFound", params)
        } catch (e: SecurityException) {
            Log.e(TAG, "SecurityException in handleDeviceFound", e)
        }
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @Suppress("MissingPermission")
    @ReactMethod
    fun startDiscovery(promise: Promise) {
        try {
            val adapter = bluetoothAdapter
            if (adapter == null) {
                promise.reject("BT_UNAVAILABLE", "Bluetooth is not available")
                return
            }

            if (!adapter.isEnabled) {
                promise.reject("BT_DISABLED", "Bluetooth is not enabled")
                return
            }

            if (isDiscovering) {
                adapter.cancelDiscovery()
            }

            val filter = IntentFilter().apply {
                addAction(BluetoothDevice.ACTION_FOUND)
                addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                reactContext.registerReceiver(discoveryReceiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                reactContext.registerReceiver(discoveryReceiver, filter)
            }

            isDiscovering = adapter.startDiscovery()
            Log.d(TAG, "Discovery started: $isDiscovering")
            if (isDiscovering) {
                promise.resolve(true)
            } else {
                promise.reject("DISCOVERY_FAILED", "Failed to start discovery")
            }
        } catch (e: SecurityException) {
            promise.reject("SECURITY_ERROR", "Bluetooth permission denied: ${e.message}")
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @Suppress("MissingPermission")
    @ReactMethod
    fun stopDiscovery(promise: Promise) {
        try {
            val adapter = bluetoothAdapter
            if (adapter == null) {
                promise.reject("BT_UNAVAILABLE", "Bluetooth is not available")
                return
            }

            adapter.cancelDiscovery()
            isDiscovering = false
            try {
                reactContext.unregisterReceiver(discoveryReceiver)
            } catch (_: Exception) {}
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @Suppress("MissingPermission")
    @ReactMethod
    fun getBondedDevices(promise: Promise) {
        try {
            val adapter = bluetoothAdapter
            if (adapter == null) {
                promise.reject("BT_UNAVAILABLE", "Bluetooth is not available")
                return
            }

            val devices = Arguments.createArray()
            adapter.bondedDevices?.forEach { device ->
                val map = Arguments.createMap().apply {
                    putString("address", device.address)
                    putString("name", device.name ?: "Unknown")
                    putInt("bondState", device.bondState)
                }
                devices.pushMap(map)
            }
            promise.resolve(devices)
        } catch (e: SecurityException) {
            promise.reject("SECURITY_ERROR", "Bluetooth permission denied: ${e.message}")
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @Suppress("MissingPermission")
    @ReactMethod
    fun pairDevice(address: String, pin: String, promise: Promise) {
        try {
            val adapter = bluetoothAdapter
            if (adapter == null) {
                promise.reject("BT_UNAVAILABLE", "Bluetooth is not available")
                return
            }

            if (isDiscovering) {
                adapter.cancelDiscovery()
                isDiscovering = false
            }

            pairingPin = pin

            val device = adapter.getRemoteDevice(address)
            if (device.bondState == BluetoothDevice.BOND_BONDED) {
                promise.resolve("ALREADY_BONDED")
                return
            }

            val result = device.createBond()
            if (result) {
                promise.resolve("BONDING_STARTED")
            } else {
                promise.reject("BOND_FAILED", "Failed to start bonding")
            }
        } catch (e: SecurityException) {
            promise.reject("SECURITY_ERROR", "Bluetooth permission denied: ${e.message}")
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @Suppress("MissingPermission")
    @ReactMethod
    fun unpairDevice(address: String, promise: Promise) {
        try {
            val adapter = bluetoothAdapter
            if (adapter == null) {
                promise.reject("BT_UNAVAILABLE", "Bluetooth is not available")
                return
            }

            val device = adapter.getRemoteDevice(address)
            val method = device.javaClass.getMethod("removeBond")
            val result = method.invoke(device) as Boolean
            if (result) {
                promise.resolve(true)
            } else {
                promise.reject("UNPAIR_FAILED", "Failed to remove bond")
            }
        } catch (e: SecurityException) {
            promise.reject("SECURITY_ERROR", "Bluetooth permission denied: ${e.message}")
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}
}
