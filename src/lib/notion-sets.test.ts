import { describe, expect, it } from 'vitest';
import { noteLineStyle } from './note-style';
import { replaceLine, splitLine, toggleCheck } from './note-blocks';
import { INITIAL_SAVED_SETS, expandSavedSet, setDraft } from './saved-sets';
describe('記事のブロック操作', () => {
  it('全角の枠を変換し、次のチェックと終了を扱う', () => {
    expect(replaceLine('', 0, '［］確認').text).toBe('☐ 確認');
    expect(splitLine('☐ 確認', 0, 4).text).toBe('☐ 確認\n☐ ');
    expect(splitLine('☐ ', 0, 2).text).toBe('');
    expect(noteLineStyle(toggleCheck('☐ 確認'))?.checked).toBe(true);
  });
  it('番号・箇条書き・引用が続き、空行で終わる', () => {
    expect(splitLine('1. 記録', 0, 5).text).toBe('1. 記録\n2. ');
    expect(splitLine('- 記録', 0, 4).text).toBe('- 記録\n- ');
    expect(splitLine('> 引用', 0, 4).text).toBe('> 引用\n> ');
    expect(splitLine('1. ', 0, 3).text).toBe('');
  });
});
describe('下書きのセット', () => {
  it('選択した採用薬だけを新しい下書きにする', () => {
    const set = INITIAL_SAVED_SETS[0];
    expect(expandSavedSet(set, [], () => 'new')).toEqual([]);
    const result = expandSavedSet(set, [0], () => 'new');
    expect(result[0].id).toBe('new');
    expect(set.rows[0].draft.id).not.toBe('new');
    expect(result[0].kind).toBe('injection');
  });
  it('元の患者の日時・重複承認を持ち越さない', () => {
    const original = INITIAL_SAVED_SETS[0].rows[0].draft;
    if (original.kind !== 'injection') throw Error();
    const copy = setDraft({ ...original, start: { day: 3, time: '10:00' }, duplicate: { action: 'replace', orderId: 'patient-order' }, interactionReasons: { pair: '理由' } }, 'copy');
    expect(copy).toMatchObject({ start: { day: null, time: null }, duplicate: null });
    expect(copy).not.toHaveProperty('interactionReasons');
  });
});

import { selectedStandingText } from './standing-set-selection';
it('指示簿では選んだ行だけを見出しの下に入れる', () => {
  expect(selectedStandingText([{ id: 'fever', cat: '頓用', text: '発熱時\n一行目\n二行目' }], ['fever:1'])).toBe('発熱時\n二行目');
});
