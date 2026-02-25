import {
  postFacebookComment,
  skipPost,
  getFirstPostText,
  getAllPostTexts,
  getAllPostElements,
  getNextUnprocessedPost,
  expandPost,
  resetAutomation,
} from '@src/facebook-utils';

console.log('[CEB] Facebook content script loaded');

// Expose functions to window for automation & manual testing
interface WindowWithFbAutomate extends Window {
  fbAutomate?: {
    getPostText: () => string;
    getAllPostTexts: () => string[];
    getAllPosts: () => HTMLElement[];
    getNextPost: () => HTMLElement | null;
    expandPost: (postEl: HTMLElement) => Promise<string>;
    postComment: (postEl: HTMLElement, text: string) => Promise<void>;
    skipPost: (postEl: HTMLElement) => Promise<void>;
    resetAutomation?: () => void;
  };
}

(window as unknown as WindowWithFbAutomate).fbAutomate = {
  getPostText: getFirstPostText,
  getAllPostTexts: getAllPostTexts,
  getAllPosts: getAllPostElements,
  getNextPost: getNextUnprocessedPost,
  expandPost: expandPost,
  postComment: postFacebookComment,
  skipPost: skipPost,
  resetAutomation: resetAutomation,
};

console.log('[CEB] Facebook automation available:');
console.log('  - window.fbAutomate.getPostText()');
console.log('  - window.fbAutomate.getNextPost()');
console.log('  - window.fbAutomate.postComment(postEl, text)');
console.log('  - window.fbAutomate.resetAutomation()');
