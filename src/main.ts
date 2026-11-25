import '@fontsource/jacquard-24';
import '@fontsource/jersey-15';
import '@fontsource/jersey-20';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/sprites.css';
import './ui/styles/table.css';
import './ui/styles/screens.css';
import { boot } from './ui/app';

boot(document.getElementById('app')!);
