import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/700.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/700.css';
import './style.css';
import { boot } from './ui/shell';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app');
void boot(root);
