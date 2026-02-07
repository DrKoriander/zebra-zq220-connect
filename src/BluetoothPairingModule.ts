import {NativeModules, NativeEventEmitter, Platform} from 'react-native';

const {BluetoothPairingModule} = NativeModules;

export interface BluetoothDevice {
  address: string;
  name: string;
  bondState: number;
}

export const BOND_NONE = 10;
export const BOND_BONDING = 11;
export const BOND_BONDED = 12;

const emitter =
  Platform.OS === 'android'
    ? new NativeEventEmitter(BluetoothPairingModule)
    : null;

export function startDiscovery(): Promise<boolean> {
  return BluetoothPairingModule.startDiscovery();
}

export function stopDiscovery(): Promise<boolean> {
  return BluetoothPairingModule.stopDiscovery();
}

export function getBondedDevices(): Promise<BluetoothDevice[]> {
  return BluetoothPairingModule.getBondedDevices();
}

export function pairDevice(
  address: string,
  pin: string = '0000',
): Promise<string> {
  return BluetoothPairingModule.pairDevice(address, pin);
}

export function unpairDevice(address: string): Promise<boolean> {
  return BluetoothPairingModule.unpairDevice(address);
}

type EventCallback = (data: any) => void;

export function onDeviceFound(callback: EventCallback) {
  return emitter?.addListener('onDeviceFound', callback);
}

export function onPairingSuccess(callback: EventCallback) {
  return emitter?.addListener('onPairingSuccess', callback);
}

export function onPairingFailed(callback: EventCallback) {
  return emitter?.addListener('onPairingFailed', callback);
}

export function onDiscoveryFinished(callback: EventCallback) {
  return emitter?.addListener('onDiscoveryFinished', callback);
}
