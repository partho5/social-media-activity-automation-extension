import {
  postFacebookComment,
  skipPost,
  getFirstPostText,
  getAllPostTexts,
  getAllPostElements,
  getNextUnprocessedPost,
  getPostImageUrls,
  expandPost,
  resetAutomation,
  getFirstCommentText,
  extractFirstUrl,
  getPostAltText,
  isVideoPost,
  playVideo,
  pauseVideo,
  scrollThroughComments,
  shareFacebookPost,
  getPostPermalink,
} from '@src/facebook-utils';

console.log('[CEB] Facebook content script loaded');

// Expose functions to window for automation & manual testing
interface WindowWithFbAutomate extends Window {
  fbAutomate?: {
    getPostText: () => string;
    getAllPostTexts: () => string[];
    getAllPosts: () => HTMLElement[];
    getNextPost: () => HTMLElement | null;
    getPostImageUrls: (postEl: HTMLElement) => string[];
    expandPost: (postEl: HTMLElement) => Promise<string>;
    postComment: (postEl: HTMLElement, text: string) => Promise<void>;
    skipPost: (postEl: HTMLElement) => Promise<void>;
    resetAutomation?: () => void;
    getFirstCommentText: (postEl: HTMLElement) => Promise<string>;
    extractFirstUrl: (text: string) => string | null;
    getPostAltText: (postEl: HTMLElement) => string;
    isVideoPost: (postEl: HTMLElement) => boolean;
    playVideo: (postEl: HTMLElement) => void;
    pauseVideo: (postEl: HTMLElement) => void;
    scrollComments: (postEl: HTMLElement) => Promise<void>;
    sharePost: (postEl: HTMLElement) => Promise<boolean>;
    getPostPermalink: (postEl: HTMLElement) => Promise<string | null>;
  };
}

(window as unknown as WindowWithFbAutomate).fbAutomate = {
  getPostText: getFirstPostText,
  getAllPostTexts: getAllPostTexts,
  getAllPosts: getAllPostElements,
  getNextPost: getNextUnprocessedPost,
  getPostImageUrls: getPostImageUrls,
  expandPost: expandPost,
  postComment: postFacebookComment,
  skipPost: skipPost,
  resetAutomation: resetAutomation,
  getFirstCommentText: getFirstCommentText,
  extractFirstUrl: extractFirstUrl,
  getPostAltText: getPostAltText,
  isVideoPost: isVideoPost,
  playVideo: playVideo,
  pauseVideo: pauseVideo,
  scrollComments: scrollThroughComments,
  sharePost: shareFacebookPost,
  getPostPermalink: getPostPermalink,
};

console.log('[CEB] Facebook automation available:');
console.log('  - window.fbAutomate.getPostText()');
console.log('  - window.fbAutomate.getNextPost()');
console.log('  - window.fbAutomate.postComment(postEl, text)');
console.log('  - window.fbAutomate.resetAutomation()');
