import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NoteBlocks } from './NoteBlocks';
import { NoteText } from './NoteText';
it('記事のチェックは独立した枠で表示する', () => {
  const html = renderToStaticMarkup(<NoteBlocks value={'☐ 未確認\n☑ 確認済み\n> 引用\n- 一覧'} onChange={() => {}} />);
  expect(html.match(/type="checkbox"/g)).toHaveLength(2);
  expect(html).toContain('line-through');
  expect(html).toContain('caret-ai');
  expect(html).toContain('文字を大きく');
});
it('経過にも枠・取り消し線・引用を表示する', () => {
  const html = renderToStaticMarkup(<NoteText text={'☑ 確認\n> 引用\n- 一覧'} />);
  expect(html).toContain('type="checkbox"');
  expect(html).toContain('line-through');
  expect(html).toContain('border-l-2');
  expect(html).toContain('・ ');
});
