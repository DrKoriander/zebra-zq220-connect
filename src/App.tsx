import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  PermissionsAndroid,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  BluetoothDevice,
  BOND_BONDED,
  BOND_BONDING,
  getBondedDevices,
  onDeviceFound,
  onDiscoveryFinished,
  onPairingFailed,
  onPairingSuccess,
  pairDevice,
  startDiscovery,
  stopDiscovery,
  unpairDevice,
} from './BluetoothPairingModule';
import {colors} from './theme';

const DEFAULT_PIN = '0000';

type PairingStatus = 'idle' | 'pairing' | 'success' | 'failed';

interface DeviceState extends BluetoothDevice {
  pairingStatus: PairingStatus;
}

// Try requesting permissions via Android API
async function requestPermissions(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    await PermissionsAndroid.requestMultiple([
      'android.permission.BLUETOOTH_SCAN' as PermissionsAndroid.Permission,
      'android.permission.BLUETOOTH_CONNECT' as PermissionsAndroid.Permission,
      'android.permission.ACCESS_FINE_LOCATION' as PermissionsAndroid.Permission,
    ]);
  } catch (e) {
    console.warn('Permission request error:', e);
  }
}

export default function App() {
  const [status, setStatus] = useState<'loading' | 'no_permission' | 'ready'>('loading');
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<DeviceState[]>([]);
  const devicesRef = useRef<DeviceState[]>([]);

  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  // Try to use BT - if it works, permissions are granted
  const tryBluetooth = useCallback(async () => {
    try {
      const bonded = await getBondedDevices();
      setDevices(
        bonded.map(d => ({...d, pairingStatus: 'idle' as PairingStatus})),
      );
      setStatus('ready');
      setError('');
    } catch (e: any) {
      console.warn('BT access failed:', e.message);
      setError(e.message || 'Bluetooth nicht verfügbar');
      setStatus('no_permission');
    }
  }, []);

  // On mount: request permissions then try BT
  useEffect(() => {
    (async () => {
      await requestPermissions();
      await tryBluetooth();
    })();
  }, [tryBluetooth]);

  useEffect(() => {
    const subs = [
      onDeviceFound?.((device: BluetoothDevice) => {
        console.log('Device found:', device.name, device.address);
        setDevices(prev => {
          if (prev.find(d => d.address === device.address)) {
            return prev;
          }
          return [...prev, {...device, pairingStatus: 'idle'}];
        });
      }),
      onDiscoveryFinished?.(() => {
        setScanning(false);
      }),
      onPairingSuccess?.((data: {address: string}) => {
        setDevices(prev =>
          prev.map(d =>
            d.address === data.address
              ? {...d, bondState: BOND_BONDED, pairingStatus: 'success'}
              : d,
          ),
        );
      }),
      onPairingFailed?.((data: {address: string}) => {
        setDevices(prev =>
          prev.map(d =>
            d.address === data.address
              ? {...d, pairingStatus: 'failed'}
              : d,
          ),
        );
      }),
    ];

    return () => {
      subs.forEach(sub => sub?.remove());
    };
  }, []);

  const handleScan = useCallback(async () => {
    if (scanning) {
      await stopDiscovery();
      setScanning(false);
      return;
    }

    setDevices(prev => prev.filter(d => d.bondState === BOND_BONDED));
    setScanning(true);
    try {
      await startDiscovery();
    } catch (e: any) {
      setScanning(false);
      console.warn('Discovery failed', e);
    }
  }, [scanning]);

  const handlePair = useCallback(async (address: string) => {
    setDevices(prev =>
      prev.map(d =>
        d.address === address ? {...d, pairingStatus: 'pairing'} : d,
      ),
    );
    try {
      const result = await pairDevice(address, DEFAULT_PIN);
      if (result === 'ALREADY_BONDED') {
        setDevices(prev =>
          prev.map(d =>
            d.address === address
              ? {...d, bondState: BOND_BONDED, pairingStatus: 'success'}
              : d,
          ),
        );
      }
    } catch (e) {
      setDevices(prev =>
        prev.map(d =>
          d.address === address ? {...d, pairingStatus: 'failed'} : d,
        ),
      );
    }
  }, []);

  const handleUnpair = useCallback(async (address: string) => {
    try {
      await unpairDevice(address);
      setDevices(prev => prev.filter(d => d.address !== address));
    } catch (e) {
      console.warn('Unpair failed', e);
    }
  }, []);

  // Loading screen
  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <StatusBar backgroundColor={colors.primary} barStyle="light-content" />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Permission error screen
  if (status === 'no_permission') {
    return (
      <View style={styles.center}>
        <StatusBar backgroundColor={colors.primary} barStyle="light-content" />
        <Text style={styles.errorText}>
          Bluetooth-Zugriff fehlgeschlagen
        </Text>
        <Text style={styles.hintText}>
          Bitte in den App-Einstellungen "Geräte in der Nähe" und "Standort"
          aktivieren.
        </Text>
        {error ? (
          <Text style={styles.debugText}>Fehler: {error}</Text>
        ) : null}
        <TouchableOpacity
          style={styles.button}
          onPress={() => Linking.openSettings()}>
          <Text style={styles.buttonText}>Einstellungen öffnen</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, {marginTop: 12, backgroundColor: colors.accent}]}
          onPress={tryBluetooth}>
          <Text style={styles.buttonText}>Erneut prüfen</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Main screen
  const bondedDevices = devices.filter(d => d.bondState === BOND_BONDED);
  const discoveredDevices = devices.filter(d => d.bondState !== BOND_BONDED);

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={colors.primary} barStyle="light-content" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Zebra ZQ220 Kopplung</Text>
        <Text style={styles.headerSubtitle}>
          Bluetooth-Drucker suchen und koppeln
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.scanButton, scanning && styles.scanButtonActive]}
        onPress={handleScan}>
        {scanning ? (
          <View style={styles.scanRow}>
            <ActivityIndicator color={colors.surface} size="small" />
            <Text style={styles.scanButtonText}>Suche stoppen</Text>
          </View>
        ) : (
          <Text style={styles.scanButtonText}>Drucker suchen</Text>
        )}
      </TouchableOpacity>

      <FlatList
        data={[...bondedDevices, ...discoveredDevices]}
        keyExtractor={item => item.address}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {scanning
              ? 'Suche nach Bluetooth-Geräten...'
              : 'Drücke "Drucker suchen" um zu beginnen'}
          </Text>
        }
        renderItem={({item}) => (
          <DeviceRow
            device={item}
            onPair={handlePair}
            onUnpair={handleUnpair}
          />
        )}
      />
    </View>
  );
}

function DeviceRow({
  device,
  onPair,
  onUnpair,
}: {
  device: DeviceState;
  onPair: (address: string) => void;
  onUnpair: (address: string) => void;
}) {
  const isBonded = device.bondState === BOND_BONDED;
  const isPairing = device.pairingStatus === 'pairing' || device.bondState === BOND_BONDING;

  return (
    <View style={styles.deviceRow}>
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{device.name}</Text>
        <Text style={styles.deviceAddress}>{device.address}</Text>
        <StatusBadge status={device.pairingStatus} bonded={isBonded} />
      </View>
      <View>
        {isBonded ? (
          <TouchableOpacity
            style={styles.unpairButton}
            onPress={() => onUnpair(device.address)}>
            <Text style={styles.unpairButtonText}>Entkoppeln</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.pairButton, isPairing && styles.pairButtonDisabled]}
            disabled={isPairing}
            onPress={() => onPair(device.address)}>
            {isPairing ? (
              <ActivityIndicator color={colors.surface} size="small" />
            ) : (
              <Text style={styles.pairButtonText}>Koppeln</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function StatusBadge({status, bonded}: {status: PairingStatus; bonded: boolean}) {
  if (bonded) {
    return (
      <View style={[styles.badge, {backgroundColor: colors.success}]}>
        <Text style={styles.badgeText}>Gekoppelt</Text>
      </View>
    );
  }
  if (status === 'pairing') {
    return (
      <View style={[styles.badge, {backgroundColor: colors.warning}]}>
        <Text style={[styles.badgeText, {color: colors.text}]}>Koppeln...</Text>
      </View>
    );
  }
  if (status === 'failed') {
    return (
      <View style={[styles.badge, {backgroundColor: colors.danger}]}>
        <Text style={styles.badgeText}>Fehlgeschlagen</Text>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primary,
    padding: 24,
    paddingTop: 48,
  },
  headerTitle: {
    color: colors.surface,
    fontSize: 22,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    marginTop: 4,
  },
  scanButton: {
    backgroundColor: colors.accent,
    margin: 16,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  scanButtonActive: {
    backgroundColor: colors.danger,
  },
  scanButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  list: {
    padding: 16,
    paddingTop: 0,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 32,
  },
  errorText: {
    color: colors.danger,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  hintText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  debugText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: 20,
    textAlign: 'center',
    fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  deviceRow: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  deviceInfo: {
    flex: 1,
    marginRight: 12,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  deviceAddress: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  badge: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  badgeText: {
    color: colors.surface,
    fontSize: 11,
    fontWeight: '600',
  },
  pairButton: {
    backgroundColor: colors.success,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
    minWidth: 90,
    alignItems: 'center',
  },
  pairButtonDisabled: {
    backgroundColor: colors.disabled,
  },
  pairButtonText: {
    color: colors.surface,
    fontWeight: '600',
  },
  unpairButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    minWidth: 90,
    alignItems: 'center',
  },
  unpairButtonText: {
    color: colors.danger,
    fontWeight: '600',
  },
});
