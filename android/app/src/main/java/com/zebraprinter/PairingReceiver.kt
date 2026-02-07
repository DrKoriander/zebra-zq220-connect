package com.zebraprinter

import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class PairingReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "PairingReceiver"
        var pin: String = "0000"
    }

    @Suppress("MissingPermission")
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != BluetoothDevice.ACTION_PAIRING_REQUEST) return

        val device = intent.getParcelableExtra<BluetoothDevice>(BluetoothDevice.EXTRA_DEVICE)
        val variant = intent.getIntExtra(BluetoothDevice.EXTRA_PAIRING_VARIANT, -1)

        Log.d(TAG, "Static receiver: pairing request device=${device?.address}, variant=$variant, name=${device?.name}")

        device ?: return

        try {
            when (variant) {
                // PAIRING_VARIANT_PIN (0)
                0 -> {
                    device.setPin(pin.toByteArray())
                    Log.d(TAG, "PIN set to $pin for ${device.address}")
                    abortBroadcast()
                }
                // PAIRING_VARIANT_PASSKEY_CONFIRMATION (2)
                2 -> {
                    device.setPairingConfirmation(true)
                    Log.d(TAG, "Passkey confirmed for ${device.address}")
                    abortBroadcast()
                }
                // PAIRING_VARIANT_CONSENT (3)
                3 -> {
                    device.setPairingConfirmation(true)
                    Log.d(TAG, "Consent confirmed for ${device.address}")
                    abortBroadcast()
                }
                else -> {
                    Log.w(TAG, "Unknown variant: $variant, trying setPairingConfirmation")
                    device.setPairingConfirmation(true)
                    abortBroadcast()
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error handling pairing", e)
        }
    }
}
