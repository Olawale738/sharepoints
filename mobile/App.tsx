import { useEffect, useRef, useState } from "react";
import { Platform, SafeAreaView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true
  })
});

const letwUrl = process.env.EXPO_PUBLIC_LETW_URL ?? "https://sharepoints.letw.org";

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [pushToken, setPushToken] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function register() {
      if (!Device.isDevice) return;
      const current = await Notifications.getPermissionsAsync();
      const permission =
        current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
      if (permission.status !== "granted") return;
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId || projectId === "REPLACE_WITH_EXPO_PROJECT_ID") return;
      const token = await Notifications.getExpoPushTokenAsync({ projectId });
      setPushToken(token.data);
    }
    void register();
  }, []);

  function syncPushToken() {
    if (!pushToken || !ready) return;
    const script = `
      fetch('/api/push-subscriptions', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          endpoint: ${JSON.stringify(pushToken)},
          platform: ${JSON.stringify(Platform.OS)},
          deviceName: ${JSON.stringify(Device.modelName ?? "LETW mobile")}
        })
      }).catch(() => undefined);
      true;
    `;
    webViewRef.current?.injectJavaScript(script);
  }

  useEffect(syncPushToken, [pushToken, ready]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.brand}>LETW</Text>
        <Text style={styles.subtitle}>Secure collaboration</Text>
      </View>
      <WebView
        ref={webViewRef}
        source={{ uri: `${letwUrl}/dashboard` }}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        javaScriptEnabled
        pullToRefreshEnabled
        onLoadEnd={() => setReady(true)}
        onNavigationStateChange={syncPushToken}
        style={styles.webview}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f7f5ef" },
  header: {
    height: 54,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#d9d6cc",
    justifyContent: "center",
    paddingHorizontal: 16
  },
  brand: { color: "#0e2a27", fontSize: 17, fontWeight: "700" },
  subtitle: { color: "#55706b", fontSize: 11 },
  webview: { flex: 1, backgroundColor: "#f7f5ef" }
});
