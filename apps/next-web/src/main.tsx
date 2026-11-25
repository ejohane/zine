import { createRoot } from 'react-dom/client';
import { ConnectedApp } from './LiveApp';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/source-serif-4/opsz.css';
import './styles.css';
// After styles.css: it re-points the app's colours and font at the Zine Next tokens.
import './bento-home.css';
createRoot(document.getElementById('root')!).render(<ConnectedApp />);
