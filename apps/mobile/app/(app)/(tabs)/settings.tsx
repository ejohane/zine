// @ts-nocheck
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAuth } from '../../../contexts/auth';
import { useRouter } from 'expo-router';
import { useClerk, useUser } from '@clerk/clerk-expo';

export default function SettingsScreen() {
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [autoSave, setAutoSave] = useState(true);

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              router.replace('/(auth)/sign-in');
            } catch (error) {
              console.error('Sign out error:', error);
              Alert.alert('Error', 'Failed to sign out');
            }
          },
        },
      ],
    );
  };

  const handleSignIn = () => {
    router.push('/(auth)/sign-in');
  };

  const SettingRow = ({ icon, title, subtitle, children }) => (
    <View style={styles.settingRow}>
      <View style={styles.settingIcon}>
        <FontAwesome name={icon} size={20} color="#3b82f6" />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle}>{title}</Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
      {children}
    </View>
  );

  const SettingSection = ({ title, children }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <View style={styles.profileContainer}>
            <View style={styles.avatar}>
              <FontAwesome name="user" size={32} color="#ffffff" />
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {isSignedIn && user ? user.fullName || user.emailAddresses[0]?.emailAddress?.split('@')[0] || 'User' : 'Guest User'}
              </Text>
              <Text style={styles.profileEmail}>
                {isSignedIn && user ? user.emailAddresses[0]?.emailAddress : 'Sign in to sync your data'}
              </Text>
            </View>
          </View>
          {isSignedIn ? (
            <TouchableOpacity style={[styles.signInButton, { backgroundColor: '#ef4444' }]} onPress={handleSignOut}>
              <Text style={styles.signInButtonText}>Sign Out</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.signInButton} onPress={handleSignIn}>
              <Text style={styles.signInButtonText}>Sign In</Text>
            </TouchableOpacity>
          )}
        </View>

        <SettingSection title="Preferences">
          <SettingRow
            icon="bell"
            title="Notifications"
            subtitle="Get updates about your feeds"
          >
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ false: '#d4d4d4', true: '#93c5fd' }}
              thumbColor={notifications ? '#3b82f6' : '#f5f5f5'}
            />
          </SettingRow>
          <SettingRow
            icon="moon-o"
            title="Dark Mode"
            subtitle="Easier on the eyes at night"
          >
            <Switch
              value={darkMode}
              onValueChange={setDarkMode}
              trackColor={{ false: '#d4d4d4', true: '#93c5fd' }}
              thumbColor={darkMode ? '#3b82f6' : '#f5f5f5'}
            />
          </SettingRow>
          <SettingRow
            icon="save"
            title="Auto-save"
            subtitle="Automatically save your bookmarks"
          >
            <Switch
              value={autoSave}
              onValueChange={setAutoSave}
              trackColor={{ false: '#d4d4d4', true: '#93c5fd' }}
              thumbColor={autoSave ? '#3b82f6' : '#f5f5f5'}
            />
          </SettingRow>
        </SettingSection>

        <SettingSection title="Account">
          <TouchableOpacity>
            <SettingRow
              icon="spotify"
              title="Connect Spotify"
              subtitle="Import your podcasts and playlists"
            >
              <FontAwesome name="chevron-right" size={16} color="#a3a3a3" />
            </SettingRow>
          </TouchableOpacity>
          <TouchableOpacity>
            <SettingRow
              icon="youtube-play"
              title="Connect YouTube"
              subtitle="Import your subscriptions"
            >
              <FontAwesome name="chevron-right" size={16} color="#a3a3a3" />
            </SettingRow>
          </TouchableOpacity>
        </SettingSection>

        <SettingSection title="About">
          <TouchableOpacity>
            <SettingRow icon="info-circle" title="About Zine">
              <FontAwesome name="chevron-right" size={16} color="#a3a3a3" />
            </SettingRow>
          </TouchableOpacity>
          <TouchableOpacity>
            <SettingRow icon="shield" title="Privacy Policy">
              <FontAwesome name="chevron-right" size={16} color="#a3a3a3" />
            </SettingRow>
          </TouchableOpacity>
          <TouchableOpacity>
            <SettingRow icon="file-text-o" title="Terms of Service">
              <FontAwesome name="chevron-right" size={16} color="#a3a3a3" />
            </SettingRow>
          </TouchableOpacity>
        </SettingSection>

        <View style={styles.footer}>
          <Text style={styles.version}>Version 1.0.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    backgroundColor: '#ffffff',
    padding: 20,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  profileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#171717',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: '#737373',
  },
  signInButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  signInButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#737373',
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  sectionContent: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e5e5e5',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    minHeight: 60,
  },
  settingIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    color: '#171717',
    fontWeight: '500',
  },
  settingSubtitle: {
    fontSize: 13,
    color: '#737373',
    marginTop: 2,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  version: {
    fontSize: 12,
    color: '#a3a3a3',
  },
});