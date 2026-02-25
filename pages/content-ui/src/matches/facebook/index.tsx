import inlineCss from '../../../dist/facebook/index.css?inline';
import { initAppWithShadow } from '@extension/shared';
import App from '@src/matches/facebook/App';

initAppWithShadow({ id: 'CEB-extension-facebook', app: <App />, inlineCss });
