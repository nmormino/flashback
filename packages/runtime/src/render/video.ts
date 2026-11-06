import type { VideoElement } from '../schema';

export interface ParsedVideoEmbed {
  type: 'iframe' | 'video';
  embedUrl: string;
}

/**
 * Parses a video URL to detect embedded players (YouTube, Vimeo, Dailymotion, Twitch)
 * or direct video files (.mp4, .webm, .ogg, data/blob URLs).
 */
export function parseVideoEmbedUrl(url: string): ParsedVideoEmbed {
  if (!url) {
    return { type: 'video', embedUrl: '' };
  }

  // 1. YouTube
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/i
  );
  if (ytMatch) {
    const id = ytMatch[1];
    return {
      type: 'iframe',
      embedUrl: `https://www.youtube.com/embed/${id}`,
    };
  }

  // 2. Vimeo
  const vimeoMatch = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)([0-9]+)/i);
  if (vimeoMatch) {
    const id = vimeoMatch[1];
    return {
      type: 'iframe',
      embedUrl: `https://player.vimeo.com/video/${id}`,
    };
  }

  // 3. Dailymotion
  const dailyMatch = url.match(/(?:dailymotion\.com\/video\/|dai\.ly\/)([a-zA-Z0-9]+)/i);
  if (dailyMatch) {
    const id = dailyMatch[1];
    return {
      type: 'iframe',
      embedUrl: `https://www.dailymotion.com/embed/video/${id}`,
    };
  }

  // 4. Twitch
  const twitchVideoMatch = url.match(/twitch\.tv\/videos\/([0-9]+)/i);
  if (twitchVideoMatch) {
    const id = twitchVideoMatch[1];
    return {
      type: 'iframe',
      embedUrl: `https://player.twitch.tv/?video=${id}&parent=localhost`,
    };
  }

  const twitchChannelMatch = url.match(/twitch\.tv\/([a-zA-Z0-9_]+)/i);
  if (twitchChannelMatch) {
    const channel = twitchChannelMatch[1];
    return {
      type: 'iframe',
      embedUrl: `https://player.twitch.tv/?channel=${channel}&parent=localhost`,
    };
  }

  // 5. Direct video fallback (.mp4, .webm, .ogg, blob, data URL, etc.)
  return {
    type: 'video',
    embedUrl: url,
  };
}

/**
 * Renders a VideoElement into either an <iframe> (for video service embeds)
 * or a native <video> element (for direct video URLs).
 */
export function renderVideo(doc: Document, el: VideoElement): HTMLElement {
  const parsed = parseVideoEmbedUrl(el.src);

  if (parsed.type === 'iframe') {
    const iframe = doc.createElement('iframe');
    iframe.src = parsed.embedUrl;
    iframe.width = String(el.width);
    iframe.height = String(el.height);
    iframe.style.position = 'absolute';
    iframe.style.left = '0';
    iframe.style.top = '0';
    iframe.style.width = `${el.width}px`;
    iframe.style.height = `${el.height}px`;
    iframe.style.border = 'none';
    iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture');
    iframe.setAttribute('allowfullscreen', 'true');
    return iframe;
  } else {
    const video = doc.createElement('video');
    video.src = el.src;
    video.width = el.width;
    video.height = el.height;
    video.style.position = 'absolute';
    video.style.left = '0';
    video.style.top = '0';
    video.style.width = `${el.width}px`;
    video.style.height = `${el.height}px`;
    video.style.display = 'block';
    if (el.autoplay) video.autoplay = true;
    if (el.loop) video.loop = true;
    if (el.muted) video.muted = true;
    if (el.controls) video.controls = true;
    if (el.poster) video.poster = el.poster;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    return video;
  }
}
