import { describe, expect, it } from 'vitest';
import type { EngineWallpaper } from './native';
import { engineIsCurrent, fileLabel, filterEngine, folderLabel, kindsOf, samePath } from './wallpaper';

const live = (title: string, kind: EngineWallpaper['kind']): EngineWallpaper => ({ id: `D:\\ws\\${title}\\project.json`, title, kind, preview: true });

describe('wallpapers', () => {
  it('compares paths the Windows way', () => {
    expect(samePath('C:\\Pics\\A.jpg', 'c:/pics/a.JPG')).toBe(true);
    expect(samePath('C:\\Pics\\', 'C:\\Pics')).toBe(true);
    expect(samePath('C:\\a.jpg', null)).toBe(false);
    expect(samePath('C:\\a.jpg', 'C:\\b.jpg')).toBe(false);
  });

  it('names files and folders', () => {
    expect(fileLabel('C:\\Pics\\Lac bleu.jpg')).toBe('Lac bleu');
    expect(fileLabel('C:\\Pics\\.hidden')).toBe('.hidden');
    expect(folderLabel('C:\\Users\\me\\Pictures\\Fonds\\')).toBe('Fonds');
  });

  it('filters Wallpaper Engine by title and type', () => {
    const all = [live('Pluie sur la ville', 'scene'), live('Lofi room', 'video'), live('Neon', 'web'), live('Écume', 'video')];
    expect(kindsOf(all)).toEqual(['scene', 'video', 'web']);
    expect(filterEngine(all, '', 'video').map((one) => one.title)).toEqual(['Lofi room', 'Écume']);
    expect(filterEngine(all, 'ecu', 'all').map((one) => one.title)).toEqual(['Écume']);
    expect(filterEngine(all, 'ville', 'video')).toEqual([]);
  });

  it('marks the current wallpaper per screen', () => {
    const current = ['D:\\ws\\A\\project.json', 'D:\\ws\\B\\project.json'];
    expect(engineIsCurrent('d:/ws/b/project.json', current, null)).toBe(true);
    expect(engineIsCurrent('D:\\ws\\B\\project.json', current, 0)).toBe(false);
    expect(engineIsCurrent('D:\\ws\\B\\project.json', current, 1)).toBe(true);
    expect(engineIsCurrent('D:\\ws\\B\\project.json', current, 4)).toBe(false);
  });
});
