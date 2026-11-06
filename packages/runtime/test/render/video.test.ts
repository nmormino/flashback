// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { parseVideoEmbedUrl, renderVideo } from '../../src/render/video';
import { DomRenderer } from '../../src/render/DomRenderer';
import { DisplayObject } from '../../src/display/DisplayObject';
import type { VideoElement, AnimDocument } from '../../src/schema';

describe('video renderer & embed parsing', () => {
  describe('parseVideoEmbedUrl', () => {
    it('parses YouTube standard watch URL', () => {
      const res = parseVideoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(res.type).toBe('iframe');
      expect(res.embedUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('parses YouTube short youtu.be URL', () => {
      const res = parseVideoEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=42');
      expect(res.type).toBe('iframe');
      expect(res.embedUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('parses YouTube embed URL', () => {
      const res = parseVideoEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ');
      expect(res.type).toBe('iframe');
      expect(res.embedUrl).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    });

    it('parses Vimeo standard URL', () => {
      const res = parseVideoEmbedUrl('https://vimeo.com/76979871');
      expect(res.type).toBe('iframe');
      expect(res.embedUrl).toBe('https://player.vimeo.com/video/76979871');
    });

    it('parses Dailymotion video URL and short URL', () => {
      const res1 = parseVideoEmbedUrl('https://www.dailymotion.com/video/x7tgad0');
      expect(res1.type).toBe('iframe');
      expect(res1.embedUrl).toBe('https://www.dailymotion.com/embed/video/x7tgad0');

      const res2 = parseVideoEmbedUrl('https://dai.ly/x7tgad0');
      expect(res2.type).toBe('iframe');
      expect(res2.embedUrl).toBe('https://www.dailymotion.com/embed/video/x7tgad0');
    });

    it('parses Twitch video and channel URLs', () => {
      const res1 = parseVideoEmbedUrl('https://www.twitch.tv/videos/123456789');
      expect(res1.type).toBe('iframe');
      expect(res1.embedUrl).toContain('player.twitch.tv/?video=123456789');

      const res2 = parseVideoEmbedUrl('https://www.twitch.tv/streamer_name');
      expect(res2.type).toBe('iframe');
      expect(res2.embedUrl).toContain('player.twitch.tv/?channel=streamer_name');
    });

    it('falls back to video type for direct video files and blobs', () => {
      const res1 = parseVideoEmbedUrl('https://example.com/movie.mp4');
      expect(res1.type).toBe('video');
      expect(res1.embedUrl).toBe('https://example.com/movie.mp4');

      const res2 = parseVideoEmbedUrl('blob:http://localhost/1234-5678');
      expect(res2.type).toBe('video');

      const res3 = parseVideoEmbedUrl('data:video/mp4;base64,AAAA');
      expect(res3.type).toBe('video');
    });
  });

  describe('renderVideo', () => {
    it('creates an iframe element for embed URLs with proper attributes', () => {
      const el: VideoElement = {
        id: 'v1',
        type: 'video',
        src: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        width: 640,
        height: 360,
      };
      const node = renderVideo(document, el);
      expect(node.tagName.toLowerCase()).toBe('iframe');
      const iframe = node as HTMLIFrameElement;
      expect(iframe.src).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
      expect(iframe.width).toBe('640');
      expect(iframe.height).toBe('360');
      expect(iframe.getAttribute('allow')).toContain('autoplay');
      expect(iframe.getAttribute('allow')).toContain('fullscreen');
    });

    it('creates a video element for direct media files with proper flags', () => {
      const el: VideoElement = {
        id: 'v2',
        type: 'video',
        src: 'https://example.com/clip.mp4',
        width: 800,
        height: 450,
        autoplay: true,
        loop: true,
        muted: true,
        controls: true,
        poster: 'https://example.com/thumb.jpg',
      };
      const node = renderVideo(document, el);
      expect(node.tagName.toLowerCase()).toBe('video');
      const video = node as HTMLVideoElement;
      expect(video.src).toBe('https://example.com/clip.mp4');
      expect(video.width).toBe(800);
      expect(video.height).toBe(450);
      expect(video.autoplay).toBe(true);
      expect(video.loop).toBe(true);
      expect(video.muted).toBe(true);
      expect(video.controls).toBe(true);
      expect(video.poster).toBe('https://example.com/thumb.jpg');
      expect(video.playsInline).toBe(true);
    });
  });

  describe('DomRenderer integration with VideoElement', () => {
    it('renders a VideoElement child in DomRenderer', () => {
      const videoEl: VideoElement = {
        id: 'vid_node',
        type: 'video',
        src: 'https://example.com/test.mp4',
        width: 320,
        height: 240,
      };

      const doc: AnimDocument = {
        version: 1,
        meta: { name: 'Video Test', createdAt: '', modifiedAt: '', editorVersion: '1.0' },
        stage: { width: 550, height: 400, fps: 24, background: { type: 'solid', color: '#000' }, scaleMode: 'showAll' },
        library: { symbols: {}, audio: {}, fonts: {}, bitmaps: {} },
        root: {
          frameCount: 1,
          layers: [
            {
              id: 'l1',
              name: 'VideoLayer',
              kind: 'normal',
              visible: true,
              locked: false,
              keyframes: [
                {
                  id: 'kf1',
                  index: 0,
                  duration: 1,
                  elements: [videoEl],
                },
              ],
            },
          ],
        },
      };

      const container = document.createElement('div');
      const renderer = new DomRenderer(container, { doc });
      const obj = new DisplayObject('videoObj');
      obj.id = 'vid_node';

      const wrapper = renderer.attach(obj);
      expect(wrapper).toBeDefined();

      const videoTag = wrapper.querySelector('video');
      expect(videoTag).not.toBeNull();
      expect(videoTag?.src).toBe('https://example.com/test.mp4');
    });
  });
});
