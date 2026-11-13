import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider } from './src/context/AuthContext';
import Colors from './src/theme/colors';

import LoginScreen from './src/screens/LoginScreen';
import RbacVerificationShell from './src/screens/RbacVerificationShell';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="dark" backgroundColor={Colors.canvasBg} />
        <Stack.Navigator
          initialRouteName="Login"
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: Colors.canvasBg,
            },
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="RbacVerification" component={RbacVerificationShell} />
        </Stack.Navigator>
      </NavigationContainer>
    </AuthProvider>
  );
}
