import './sources/unistyles';
import { Platform } from 'react-native';
import FontFaceObserver from 'fontfaceobserver';

if (Platform.OS === 'web') {
    FontFaceObserver.prototype.load = function () {
        return Promise.resolve();
    };
}

import 'expo-router/entry';
