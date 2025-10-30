import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useTheme } from '../contexts/theme';

interface ConnectionStatusCardProps {
  provider: 'spotify' | 'youtube';
  isConnected: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function ConnectionStatusCard({ provider, isConnected, onConnect, onDisconnect }: ConnectionStatusCardProps) {
  const { colors, isDark } = useTheme();
  
  const providerName = provider === 'spotify' ? 'Spotify' : 'YouTube';
  const providerIcon = provider === 'spotify' ? 'spotify' : 'youtube-play';
  const providerColor = provider === 'spotify' ? '#1DB954' : '#FF0000';

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.header}>
        <View style={[styles.icon, { backgroundColor: isDark ? colors.secondary : '#eff6ff' }]}>
          <FontAwesome name={providerIcon} size={24} color={providerColor} />
        </View>
        <View style={styles.info}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {isConnected ? 'Connected' : 'Not Connected'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {isConnected 
              ? `Manage your ${providerName} subscriptions` 
              : `Connect ${providerName} to continue`
            }
          </Text>
        </View>
        {isConnected && (
          <View style={styles.status}>
            <FontAwesome name="check-circle" size={20} color="#22c55e" />
          </View>
        )}
      </View>
      
      {!isConnected && onConnect && (
        <TouchableOpacity 
          style={[styles.connectButton, { backgroundColor: providerColor }]} 
          onPress={onConnect}
        >
          <Text style={styles.connectButtonText}>
            Connect {providerName}
          </Text>
        </TouchableOpacity>
      )}
      
      {isConnected && onDisconnect && (
        <TouchableOpacity 
          style={[styles.disconnectButton, { borderColor: colors.border }]} 
          onPress={onDisconnect}
        >
          <Text style={[styles.disconnectButtonText, { color: '#ef4444' }]}>
            Disconnect Account
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginBottom: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
  },
  status: {
    marginLeft: 8,
  },
  connectButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  connectButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  disconnectButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
  },
  disconnectButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
