const GMAIL_WEB = 'https://mail.google.com/mail/u/0/#inbox';

/** Open the Gmail app on mobile, or Gmail in the browser on desktop. */
export function openGmailInbox() {
  const ua = navigator.userAgent || '';
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  if (!isAndroid && !isIOS) {
    window.open(GMAIL_WEB, '_blank', 'noopener,noreferrer');
    return;
  }

  const fallback = window.setTimeout(() => {
    if (!document.hidden) {
      window.location.href = GMAIL_WEB;
    }
  }, 900);

  const clearFallback = () => {
    window.clearTimeout(fallback);
    document.removeEventListener('visibilitychange', clearFallback);
  };
  document.addEventListener('visibilitychange', clearFallback);

  if (isAndroid) {
    window.location.href =
      'intent://inbox/#Intent;scheme=googlegmail;package=com.google.android.gm;S.browser_fallback_url=' +
      encodeURIComponent(GMAIL_WEB) +
      ';end';
    return;
  }

  window.location.href = 'googlegmail://';
}
