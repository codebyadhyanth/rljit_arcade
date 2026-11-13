# RLJIT Arcade Mobile App — Dependency Architecture & Technical Requirements

> **Platform:** Native Mobile (Android & iOS) via Expo SDK 58  
> **Runtime:** React Native 0.88.1 + React 19.3.0  
> **Security Model:** Hardware KeyStore / Keychain Vault + Biometric Challenge + Screen Privacy Prevention  
> **Backend Integration:** RESTful Node.js/Express with Argon2id + AES-256-GCM + PostgreSQL Transactional Audits  

---

## 1. Production Dependencies (`dependencies`)

| Package Name | Exact Version in `package.json` | Architectural Category | Primary Purpose & Hardware / Security Requirement |
| :--- | :--- | :--- | :--- |
| **`expo`** | `~58.0.25` | Native Runtime Framework | Core Expo SDK 58 application framework managing the universal runtime, configuration (`app.json`), assets, and native bridge abstractions. |
| **`react`** | `19.3.0` | Core UI Engine | Component runtime and reactivity model compatible with React Native 0.88 New Architecture and concurrent rendering features. |
| **`react-native`** | `0.88.1` | Native Primitive Engine | Provides native platform bridge, core primitives (`View`, `Text`, `TextInput`, `TouchableOpacity`, `Pressable`, `ScrollView`, `KeyboardAvoidingView`, `StyleSheet`), and event handling. |
| **`@react-navigation/native`** | `^7.0.14` | Navigation Architecture | Top-level routing state manager (`NavigationContainer`) for native screen transitions, deep-linking, and route history stacks. |
| **`@react-navigation/native-stack`** | `^7.2.0` | Native Stack Navigator | High-performance navigation stack using platform-native view hierarchy controllers for 60fps card transitions and stack memory management. |
| **`react-native-screens`** | `~4.30.1` | Native Screen Memory | Native view management library that enables native UIViewController / Fragment recycling, ensuring inactive background screens do not leak memory. |
| **`react-native-safe-area-context`** | `~5.11.1` | Device Geometry & Insets | Dynamically detects device physical notches, Dynamic Islands, status bars, and home indicator bars to render content within safe visible bounds. |
| **`axios`** | `^1.7.9` | Network Client | Configured HTTP client in `src/config/api.js` for asynchronous communication with the Express backend (`/api/v1/auth/login`, `/api/v1/auth/bootstrap-super-admin`, etc.) with interceptors for token injection and session revocation. |
| **`expo-secure-store`** | `~58.0.3` | Hardware-Encrypted Storage | Provides hardware-backed encrypted key-value storage (Android KeyStore / iOS Keychain Services). Stores the user's JWT access token (`rljit_mobile_token`) so credentials are never stored in plaintext `AsyncStorage`. |
| **`expo-local-authentication`** | `~58.0.3` | Biometric Security | Interfaces with device biometric sensors (Fingerprint, Face ID, Android BiometricPrompt) to allow fast-track authentication on trusted enrolled hardware. |
| **`expo-screen-capture`** | `~58.0.6` | Privacy & Screenshot Guard | Enforces `FLAG_SECURE` on Android and blocks screenshot/screen recording on iOS while sensitive views (passwords, tokens, database receipts, personal student records) are on display. |
| **`expo-camera`** | `~58.0.14` | Hardware Camera Interface | Grants direct hardware access to mobile cameras. Required for mobile-exclusive attendance sheet image capture, optical mark scanning, and physical paper attendance audits. |
| **`expo-image-picker`** | `~58.0.10` | Media & Gallery Picker | Native file and image picker for uploading student profile photos, physical document verifications, and scanned attendance logs from device storage. |
| **`expo-linear-gradient`** | `^58.0.4` | Native Gradient Shaders | Hardware-accelerated gradient shader rendering for warm sunset and obsidian backgrounds matching the visual DNA of the reference aesthetic without dropping frame rates. |
| **`expo-blur`** | `^58.0.6` | Glassmorphism & Blur | Native glassmorphic blur effects (`BlurView`) for bottom sheets, modal overlays, and status bar treatments. |
| **`expo-status-bar`** | `~58.0.5` | System Status Bar Controller | Dynamically configures the device status bar style (`light`/`dark`), background color, and translucency. |
| **`react-native-svg`** | `15.16.0` | Vector Graphics Engine | Renders resolution-independent SVG elements on native mobile canvases. Prerequisite dependency for `lucide-react-native`. |
| **`lucide-react-native`** | `^0.475.0` | Native Iconography | Native vector icon suite sharing visual parity with the Web Portal's Lucide icons (stroke width, curvature, aesthetic consistency). |

---

## 2. Development Dependencies (`devDependencies`)

| Package Name | Exact Version in `package.json` | Tooling Role | Architectural Justification |
| :--- | :--- | :--- | :--- |
| **`@babel/core`** | `^7.25.2` | JavaScript Transpiler | Core Babel compiler engine responsible for transforming modern JavaScript, JSX, and TypeScript into optimized bytecode for Hermes / JavaScriptCore runtimes. |
| **`babel-preset-expo`** | `^58.0.24` | Expo Babel Configuration | Official Expo preset configuring Babel plugins, module resolution, JSX runtime, and React 19 compatibility transformations for native targets. |

---

## 3. Dependency Integrity & Maintenance Governance

1. **Zero Uninstallation Policy:** No dependencies may be uninstalled or pruned from `package.json`. Hardware modules (`expo-camera`, `expo-secure-store`, `expo-local-authentication`) are integral components of the mobile application architecture.
2. **SDK 58 Compatibility:** All Expo modules are aligned with Expo SDK 58, React 19.3.0, and React Native 0.88.1. Any manual version manipulation must be validated against Expo official dependency matrix.
3. **Native Security Primitives:** Plaintext storage libraries (e.g., standard `AsyncStorage`) are strictly banned in favor of `expo-secure-store` for all auth tokens and cryptographic metadata.

