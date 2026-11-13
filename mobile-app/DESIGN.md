# RLJIT Arcade Mobile App — Visual Design Specification

> **Platform:** React Native & Expo Mobile Application  
> **Source Visual DNA:** CampusHub Warm-Neutral Bento Aesthetic (Reference Image)  
> **Styling Framework:** React Native `StyleSheet.create` & Native Primitives  
> **Design Philosophy:** Native Ergonomics, Hardware Security Awareness, Shared Brand Identity with Web Portal  

---

## 1. Master Native Color Tokens (`src/theme/colors.js`)

All mobile screens use identical color tokens as the Web Portal, exported as typed JavaScript constants:

```javascript
export const Colors = {
  // Canvases & Surfaces
  canvasBg: '#F4F4F6',          // Warm light-gray canvas background
  surfaceCard: '#FFFFFF',       // Primary card surface
  surfaceDark: '#121214',       // High-contrast obsidian surface (buttons, cards)
  surfaceDarkSubtle: '#1C1C1F', // Secondary dark surface

  // Hairlines & Dividers
  hairlineBorder: '#EBEBEF',    // Subtle 1dp border for light cards
  hairlineBorderDark: 'rgba(255, 255, 255, 0.08)', // Dark card border
  divider: '#E4E4E7',

  // Primary Brand & Accents
  brandOrange: '#EA580C',       // Primary brand burnt orange
  brandOrangeHover: '#C2410C',
  brandOrangeLight: '#FFF7ED',  // Warm light orange tint

  // Status & Telemetry
  statusEmerald: '#10B981',     // Success indicators & verified DB badges
  statusEmeraldBg: '#ECFDF5',   // Success container background
  statusRose: '#EF4444',        // Error messages & alerts
  statusRoseBg: '#FEF2F2',
  statusAmber: '#F59E0B',       // Warning badges & notices
  statusAmberBg: '#FFFBEB',

  // Typography
  textPrimary: '#09090B',       // Main headlines and titles
  textBody: '#27272A',          // Standard content text
  textMuted: '#71717A',         // Labels, hints, placeholders
  textInverse: '#FFFFFF',       // Text rendered on obsidian dark surfaces
};

export default Colors;
```

---

## 2. Density-Independent Pixel (`dp`) & Spacing Scales

All measurements are specified in density-independent pixels (`dp`):

| Token | Dimension (dp) | Usage |
| :--- | :--- | :--- |
| **`space-xs`** | `4dp` | Inline icon spacing, badge padding |
| **`space-sm`** | `8dp` | Tight stack gap, label-to-input gap |
| **`space-md`** | `16dp` | Form field vertical gaps, standard card internal padding |
| **`space-lg`** | `24dp` | Screen edge horizontal padding, section separation |
| **`space-xl`** | `32dp` | Top header clearance, hero block vertical spacing |

### Touch Target Minimums
- All interactive controls (`TouchableOpacity`, `Pressable`, action buttons, mask toggle icons) MUST have a minimum hit area of **48dp × 48dp** to satisfy mobile ergonomic accessibility standards.

---

## 3. Geometry & Corner Radii

Soft squircle curvature mapped to React Native `borderRadius`:

| Element | Border Radius | Description |
| :--- | :--- | :--- |
| **Primary Cards** | `20dp` | Main surface containers and verification cards |
| **Input Fields** | `14dp` | Single-line and masked credential inputs |
| **Primary Action Buttons** | `14dp` or `28dp` (Pill) | Obsidian action buttons and bootstrap triggers |
| **Status Badges** | `999dp` (Pill) | Inline audit tags, active session pills |

---

## 4. Platform-Specific Elevation & Shadows

React Native requires dual declarations to achieve cross-platform soft elevation:

```javascript
cardShadow: {
  // iOS Cross-Platform Shadow
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.05,
  shadowRadius: 12,

  // Android Elevation
  elevation: 2,
}
```

---

## 5. Mobile Component Blueprints

### A. Screen Hierarchy & Insets
All screens must wrap content in `SafeAreaView` from `react-native-safe-area-context` and `KeyboardAvoidingView` to prevent software keyboard overlap:

```javascript
<SafeAreaView style={styles.safeArea}>
  <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    style={styles.keyboardContainer}
  >
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* Content */}
    </ScrollView>
  </KeyboardAvoidingView>
</SafeAreaView>
```

### B. Form Inputs with Hairline Borders
```javascript
const styles = StyleSheet.create({
  inputContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 52, // 48dp+ accessibility guarantee
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
  },
});
```

### C. Obsidian Primary Button (`Pressable` with Feedback)
```javascript
<TouchableOpacity
  activeOpacity={0.88}
  style={styles.primaryButton}
  onPress={handleLogin}
  disabled={loading}
>
  {loading ? (
    <ActivityIndicator color="#FFFFFF" size="small" />
  ) : (
    <Text style={styles.primaryButtonText}>Sign In</Text>
  )}
</TouchableOpacity>

// Style
primaryButton: {
  backgroundColor: Colors.surfaceDark,
  height: 52,
  borderRadius: 14,
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: 8,
},
primaryButtonText: {
  color: Colors.textInverse,
  fontSize: 15,
  fontWeight: '600',
}
```

### D. Error Banner
```javascript
<View style={styles.errorBanner}>
  <Text style={styles.errorText}>{error}</Text>
</View>

// Style
errorBanner: {
  backgroundColor: Colors.statusRoseBg,
  borderWidth: 1,
  borderColor: '#FECACA',
  borderRadius: 12,
  padding: 14,
  marginBottom: 16,
},
errorText: {
  color: Colors.statusRose,
  fontSize: 13,
  fontWeight: '500',
  lineHeight: 18,
}
```

