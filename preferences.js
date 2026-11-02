
'use strict';
(() => {
  let theme='light',language='en';
  try {
    // Apply the requested company defaults once; subsequent manual choices persist.
    if(localStorage.getItem('onelaser-workos-defaults')!=='en-light-20261029'){
      localStorage.setItem('onelaser-workos-theme','light');
      localStorage.setItem('onelaser-workos-language','en');
      localStorage.setItem('onelaser-workos-defaults','en-light-20261029');
    }
    theme=localStorage.getItem('onelaser-workos-theme')==='dark'?'dark':'light';
    language=localStorage.getItem('onelaser-workos-language')==='zh'?'zh-CN':'en';
  } catch {}
  document.documentElement.dataset.theme=theme;
  document.documentElement.lang=language;
})();
