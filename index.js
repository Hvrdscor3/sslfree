import { AppRegistry, LogBox } from 'react-native';
import App from './src/App';
import { name as appName } from './app.json';

// En las versiones de depuración, el aviso amarillo "Open debugger to view warnings" tapaba la barra.
LogBox.ignoreAllLogs();

AppRegistry.registerComponent(appName, () => App);
