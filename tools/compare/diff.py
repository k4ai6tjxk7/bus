"""比對兩份 run.py 的結果，列出每個流程不一樣的地方。

用法：python3 tools/compare/diff.py <改版前.json> <改版後.json>
完全一樣時結束代碼是 0，有差異是 1。"""
import json
import sys

def main(argv):
    if len(argv) != 3:
        print(__doc__)
        return 2
    with open(argv[1], encoding='utf-8') as f:
        a = json.load(f)
    with open(argv[2], encoding='utf-8') as f:
        b = json.load(f)
    diffs = 0
    for flow in sorted(set(a) | set(b)):
        if flow not in a or flow not in b:
            diffs += 1
            print(f'只有{"改版後" if flow in b else "改版前"}有：{flow}')
            continue
        for key in sorted(set(a[flow]) | set(b[flow])):
            if a[flow].get(key) != b[flow].get(key):
                diffs += 1
                print(f'不同：{flow} / {key}')
                print('  改版前：', json.dumps(a[flow].get(key), ensure_ascii=False))
                print('  改版後：', json.dumps(b[flow].get(key), ensure_ascii=False))
    errors = {k: v['errors'] for k, v in b.items() if v.get('errors')}
    print(f'流程 {len(b)} 個，差異 {diffs} 處，改版後的 JS 錯誤：{errors or "無"}')
    return 1 if diffs or errors else 0

if __name__ == '__main__':
    sys.exit(main(sys.argv))
