import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import UnderDevelopmentView from '../UnderDevelopmentView';
import Colors from '../../theme/colors';

export default function MobileChatbotPlaceholder({ onBack }) {
  return (
    <View style={styles.container}>
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          style={styles.backBar}
          activeOpacity={0.8}
        >
          <Text style={styles.backBarText}>← Back to Services</Text>
        </TouchableOpacity>
      ) : null}

      <UnderDevelopmentView
        moduleName="RLJIT Arcade AI Assistant"
        phase="Upcoming Phase"
        description="Institutional conversational assistant for timetables, circulars, and academic queries will be activated in an upcoming phase once verified PostgreSQL retrieval controllers are mounted."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  backBar: {
    minHeight: 48,
    backgroundColor: Colors.surfaceCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.hairlineBorder,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  backBarText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.brandOrange,
  },
});
