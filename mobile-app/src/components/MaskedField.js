import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Colors from '../theme/colors';

export default function MaskedField({ value, label, mono = true }) {
  const [revealed, setRevealed] = useState(false);

  const displayVal = revealed ? value : '••••••••••••';

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.box}>
        <Text style={[styles.text, mono && styles.monoText]} numberOfLines={1}>
          {value ? displayVal : '<Not Available>'}
        </Text>
        <TouchableOpacity
          onPress={() => setRevealed(!revealed)}
          style={styles.revealBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.revealBtnText}>{revealed ? 'Hide' : 'Reveal'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FBFBFC',
    borderColor: Colors.hairlineBorder,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  text: {
    flex: 1,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '600',
  },
  revealBtn: {
    backgroundColor: Colors.surfaceCard,
    borderColor: Colors.hairlineBorder,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginLeft: 8,
  },
  revealBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
});
