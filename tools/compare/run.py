"""在 headless 瀏覽器裡跑 App 的使用流程，記下每個流程送出的 TDX 查詢與畫面結果。

TDX 用假資料回應、時鐘用假的，所以每次跑的結果都一樣，可以拿改版前後的結果互相比對。
所有站名、路線都是假的。

用法：python3 tools/compare/run.py <網站目錄> <輸出.json> [群組 ...]
群組：route（找路線）、update（到站更新）、usage（使用習慣）；不給就全跑。
瀏覽器：預設用 Playwright 自帶的 Chromium；要用別的，設環境變數 CHROME=<執行檔路徑>。"""
import functools
import http.server
import json
import os
import re
import socketserver
import sys
import threading
import urllib.parse

from playwright.sync_api import sync_playwright

T0 = 1762394400000  # 假時鐘起點：星期四 10:00（台灣時間）
D = 864e5

# ---------- 假 TDX ----------

def st(city, rid, name, d, stops):
    return {'RouteUID': rid, 'RouteName': {'Zh_tw': name}, 'Direction': d,
            'Stops': [{'StopUID': f'{rid}-{i}', 'StopName': {'Zh_tw': s}} for i, s in enumerate(stops)], '_c': city}

ROUTES = [
    # 雙北：直達
    st('Taipei', 'T1', 'L1', 0, ['甲站', '中', '乙站']),
    st('Taipei', 'T1', 'L1', 1, ['乙站', '中', '甲站']),
    st('Taipei', 'T2', 'L2', 0, ['己站(東)', '乙站']),
    # 台中：沒有直達，轉一次
    st('Taichung', 'C1', 'M1', 0, ['子站', 'a', '轉一', 'b', '轉二']),
    st('Taichung', 'C2', 'M2', 0, ['子站', '轉二']),
    st('Taichung', 'C3', 'M3', 0, ['轉一', 'c', '丑站']),
    st('Taichung', 'C4', 'M4', 0, ['轉二', '丑站']),
    # 台中：轉乘組合其實已有直達
    st('Taichung', 'C5', 'M5', 0, ['寅站', '轉三', '丑站']),
    st('Taichung', 'C6', 'M6', 0, ['寅站', '轉三']),
    # 台中：直達
    st('Taichung', 'C7', 'M7', 0, ['卯站', '辰站']),
]

def contains(flt):
    m = re.search(r"Zh_tw,'((?:[^']|'')*)'\)", flt)
    return m.group(1).replace("''", "'") if m else None

def handle(url):
    u = urllib.parse.urlparse(url)
    q = dict(urllib.parse.parse_qsl(u.query))
    city = u.path.split('/')[-1]
    flt = q.get('$filter', '')
    if '/StopOfRoute/' in u.path:
        kw = contains(flt)
        return [{k: v for k, v in r.items() if k != '_c'} for r in ROUTES
                if r['_c'] == city and any(kw in s['StopName']['Zh_tw'] for s in r['Stops'])]
    if '/Stop/' in u.path:
        kw = contains(flt)
        names = {s['StopName']['Zh_tw'] for r in ROUTES if r['_c'] == city for s in r['Stops'] if kw in s['StopName']['Zh_tw']}
        return [{'StopName': {'Zh_tw': n}} for n in sorted(names)]
    if '/EstimatedTimeOfArrival/' in u.path:
        uids = re.findall(r"StopUID eq '([^']+)'", flt)
        out = []
        if 'OLD-1' in uids:
            out.append({'StopUID': 'OLD-1', 'RouteUID': 'T1', 'Direction': 0, 'StopStatus': 0, 'EstimateTime': 400})
        for r in ROUTES:
            if r['_c'] != city:
                continue
            for s in r['Stops']:
                if s['StopUID'] in uids:
                    out.append({'StopUID': s['StopUID'], 'RouteUID': r['RouteUID'], 'Direction': r['Direction'],
                                'StopStatus': 0, 'EstimateTime': 330 + 60 * len(out)})
        return out
    return []

def label(url):
    """查詢紀錄：種類 縣市 關鍵字（或站牌）"""
    u = urllib.parse.urlparse(url)
    q = dict(urllib.parse.parse_qsl(u.query))
    parts = u.path.split('/')
    kind, city = parts[-3], parts[-1]
    flt = q.get('$filter', '')
    kw = contains(flt)
    return f'{kind} {city} ' + (kw if kw is not None else ' '.join(sorted(re.findall(r"StopUID eq '([^']+)'", flt))))

# ---------- 網站與瀏覽器 ----------

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

def serve(root):
    h = functools.partial(Quiet, directory=root)
    s = socketserver.TCPServer(('127.0.0.1', 0), h)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s

def clean_pairs(raw):
    a = json.loads(raw or '[]')
    for p in a:
        p.pop('resolvedAt', None)
        if p['id'].startswith('p1'):
            p['id'] = 'NEW'
    return a

def run(browser, port, pairs, cur, steps, fail_eta=False, extra=None):
    log = []
    ctx = browser.new_context(viewport={'width': 390, 'height': 844}, timezone_id='Asia/Taipei')

    def route(r):
        url = r.request.url
        if 'openid-connect' in url:
            log.append('TOKEN')
            return r.fulfill(json={'access_token': 'T', 'expires_in': 86400})
        log.append(label(url))
        if fail_eta and 'EstimatedTime' in url:
            return r.fulfill(status=500, body='boom')
        r.fulfill(json=handle(url))
    ctx.route('https://tdx.transportdata.tw/**', route)
    init = {'bus.cfg': {'id': 'id', 'secret': 'sec'}, 'bus.tok': {'v': 'T', 'exp': 4102444800000},
            'bus.pairs': pairs, 'bus.cur': cur, 'bus.tip': True, **(extra or {})}
    ctx.add_init_script('if(!sessionStorage.getItem("seeded")){sessionStorage.setItem("seeded","1");'
                        + ''.join(f'localStorage.setItem({json.dumps(k)},{json.dumps(json.dumps(v))});' for k, v in init.items()) + '}')
    page = ctx.new_page()
    page.clock.install(time=T0 / 1000)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{port}/index.html')
    page.wait_for_timeout(1500)
    shots = {'_log': log}
    for step in steps:
        step(page, shots)
    res = {'queries': log, 'errors': errors, 'pairs': clean_pairs(page.evaluate('localStorage.getItem("bus.pairs")')),
           'title': page.text_content('#boardTitle'), 'hero': page.inner_text('#hero'),
           'msg': page.inner_text('#msg') if page.is_visible('#msg') else '', **shots}
    res.pop('_log')
    ctx.close()
    return res

# ---------- 步驟 ----------

def wait(ms=1200):
    return lambda p, s: p.wait_for_timeout(ms)

def click(sel, ms=1200):
    def f(p, s):
        p.click(sel)
        p.wait_for_timeout(300)
        for _ in range(180):  # 排隊等查詢額度時最多等 90 秒
            if '尋找中' not in p.inner_text('#pairList'):
                break
            p.wait_for_timeout(500)
        p.wait_for_timeout(ms)
    return f

def grab(key, sel):
    def f(p, s):
        s[key] = p.inner_text(sel)
    return f

def settings(p, s):
    p.click('#btnSettings')
    p.wait_for_timeout(400)

def add(region, frm, to, name):
    def f(p, s):
        p.select_option('#pRegion', region)
        p.fill('#pName', name)
        p.fill('#kwFrom', frm); p.click('#sFrom'); p.wait_for_timeout(800); p.select_option('#selFrom', label=frm)
        p.fill('#kwTo', to); p.click('#sTo'); p.wait_for_timeout(800); p.select_option('#selTo', label=to)
        p.click('#btnAdd'); p.wait_for_timeout(1500)
        s['addStatus'] = p.inner_text('#addStatus')
        s['picker'] = p.inner_text('#viaPick')
    return f

def adv(ms, real=900):
    """假時鐘往前跳 ms 毫秒（期間的計時器都會跑）"""
    def f(p, s):
        p.clock.fast_forward(ms)
        p.wait_for_timeout(real)
    return f

def mark(name):
    return lambda p, s: s['_log'].append('-- ' + name)

def snap(key):
    def f(p, s):
        s[key] = {'title': p.text_content('#boardTitle'), 'hero': p.inner_text('#hero'),
                  'list': p.inner_text('#list') if p.is_visible('#list') else '',
                  'legNote': p.inner_text('#legNote') if p.is_visible('#legNote') else '',
                  'msg': p.inner_text('#msg') if p.is_visible('#msg') else '',
                  'stale': 'stale' in (p.get_attribute('#live', 'class') or ''),
                  'hidNote': p.inner_text('#hidNote') if p.is_visible('#hidNote') else '',
                  'legBtn': p.inner_text('#legBtn') if p.is_visible('#legBtn') else ''}
    return f

def vis(state):
    """模擬 App 切到背景（hidden）或回到前景（visible）"""
    return lambda p, s: (p.evaluate("st => {Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>st}); document.dispatchEvent(new Event('visibilitychange'))}", state), p.wait_for_timeout(600))

def tap(p, s):
    p.click('#boardTitle')
    p.wait_for_timeout(1200)

def pick_pair(pid):
    return lambda p, s: (p.click('#pairBtn'), p.click(f'#pairMenu button[data-id="{pid}"]'), p.wait_for_timeout(1500))

def quota_at(ms, n):
    """把查詢額度紀錄塞滿，讓之後的自動更新被跳過"""
    return lambda p, s: p.evaluate("([t,n]) => localStorage.setItem('bus.calls', JSON.stringify(Array(n).fill(t)))", [T0 + ms, n])

def usage_snap(key):
    def f(p, s):
        s[key] = {'name': p.inner_text('#pairName'), 'why': p.inner_text('#pairWhy') if p.is_visible('#pairWhy') else '',
                  'usage': json.loads(p.evaluate("() => localStorage.getItem('bus.usage')") or 'null')}
    return f

def settings_usage(key):
    def f(p, s):
        s[key] = {'status': p.inner_text('#usageStatus'), 'clearBtn': p.is_visible('#btnClearUsage'),
                  'usage': json.loads(p.evaluate("() => localStorage.getItem('bus.usage')") or 'null')}
    return f

# ---------- 組合與使用紀錄 ----------

def pair(pid, name, frm, to, region=None, via=None):
    """還沒找過路線的組合"""
    p = {'id': pid, 'name': name, 'from': frm, 'to': to, 'routes': []}
    if region: p['region'] = region
    if via: p['via'] = via; p['routes2'] = []
    return p

def ready(pid, frm, to, routes, region=None, via=None, routes2=None, age=0):
    """已經找好路線的組合；age＝路線找了多久"""
    q = {'id': pid, 'name': pid, 'from': frm, 'to': to, 'routes': routes, 'resolvedAt': T0 - age}
    if region: q['region'] = region
    if via: q['via'] = via; q['routes2'] = routes2
    return q

R = lambda city, rid, name, stop, hops=1: {'city': city, 'route': rid, 'name': name, 'dir': 0, 'stop': stop, 'hops': hops}
PA = ready('pa', '甲站', '乙站', [R('Taipei', 'T1', 'L1', 'T1-0', 2)])
PC = ready('pc', '子站', '丑站', [R('Taichung', 'C1', 'M1', 'C1-0', 2)], 'taichung', '轉一', [R('Taichung', 'C3', 'M3', 'C3-0', 2)])
PF = ready('pf', '卯站', '辰站', [R('Taichung', 'C7', 'M7', 'C7-0')], 'taichung')
LEAK = ready('pl', '甲站', '乙站', [R('Taipei', 'T1', 'L1', 'OLD-1', 2)], age=7 * D - 60000)

def U(*xs):
    return {'bus.usage': [[i, int(t)] for i, t in xs]}

# ---------- 流程 ----------
# 每個流程：(組合, 目前組合, 步驟[, TDX 到站查詢失敗[, 其他 localStorage]])

FLOWS = {
    'route': {
        'R1 直達組合開啟後重找路線＋查到站': ([pair('pa', '組合一', '甲站', '乙站')], 'pa', [wait(2000)]),
        'R2 括號站名：查詢關鍵字去掉括號、標題也去掉': ([pair('pb', '括號', '己站(東)', '乙站')], 'pb', [wait(2000)]),
        'R3 轉乘組合重找（台中）': ([pair('pc', '轉乘', '子站', '丑站', 'taichung', '轉一')], 'pc',
                             [wait(2000), click('#legBtn', 800), grab('leg2hero', '#hero')]),
        'R4 轉乘組合重找時發現直達': ([pair('pd', '有直達', '寅站', '丑站', 'taichung', '轉三')], 'pd',
                              [wait(2000), settings, grab('pairList', '#pairList')]),
        'R5 新增組合：有直達': ([], None, [settings, add('taichung', '卯站', '辰站', '新直達'), grab('pairList', '#pairList')]),
        'R6 新增組合：沒直達，選第二個轉乘站': ([], None, [settings, add('taichung', '子站', '丑站', '新轉乘'),
                                        lambda p, s: (p.check('#viaPick input[value="1"]'), p.click('#viaPick button.primary'), p.wait_for_timeout(600)),
                                        grab('addStatus2', '#addStatus'), grab('pairList', '#pairList')]),
        'R7 設定頁：換轉乘站': ([pair('pc', '轉乘', '子站', '丑站', 'taichung', '轉一')], 'pc',
                         [wait(2000), settings, click('#pairList button[data-act="via"]', 1500), grab('picker', '#pairList .vp'),
                          lambda p, s: (p.wait_for_selector('#pairList .vp input', timeout=90000), p.check('#pairList .vp input[value="0"]'),
                                        p.click('#pairList .vp button.primary'), p.wait_for_timeout(600)),
                          grab('pairList', '#pairList')]),
        'R8 設定頁：直達組合找不到路線→找轉乘站': ([pair('pe', '沒路', '子站', '丑站', 'taichung')], 'pe',
                                   [wait(2000), settings, grab('pairListBefore', '#pairList'),
                                    click('#pairList button[data-act="via"]', 1500), grab('picker', '#pairList .vp')]),
        'R9 設定頁：重找路線（直達組合）': ([pair('pa', '組合一', '甲站', '乙站')], 'pa',
                               [wait(2000), settings, click('#pairList button[data-act="re"]', 1500), grab('pairList', '#pairList')]),
    },
    'update': {
        'A1 倒數與更新頻率（60 秒）': ([PA], 'pa', [wait(1500), snap('t0'), mark('+40s'), adv(40000), snap('t40'), mark('+25s'), adv(25000), snap('t65')]),
        'A2 切段不查詢、第二段警告': ([PC], 'pc', [wait(1500), snap('leg1'), mark('switch'), click('#legBtn', 600), snap('leg2'), click('#legBtn', 600), snap('back1')]),
        'A3 切換組合': ([PA, PF], 'pa', [wait(1500), snap('a'), mark('switch'), pick_pair('pf'), snap('f')]),
        'A4 閒置暫停與恢復': ([PA], 'pa', [wait(1500), mark('+11min'), adv(11 * 60000), snap('idle'), mark('+2min'), adv(2 * 60000), mark('tap'), tap, snap('woke')]),
        'A5 離開 31 分鐘回來：回第一段': ([PC], 'pc', [wait(1500), click('#legBtn', 600), snap('leg2'), vis('hidden'), mark('+31min'), adv(31 * 60000, 300), vis('visible'), wait(1200), snap('back')]),
        'A6 離開 20 分鐘回來：維持第二段': ([PC], 'pc', [wait(1500), click('#legBtn', 600), vis('hidden'), mark('+20min'), adv(20 * 60000, 300), vis('visible'), wait(1200), snap('back')]),
        'A7 設定頁不查詢、回看板重查': ([PA], 'pa', [wait(1500), settings, mark('+3min'), adv(3 * 60000), mark('back'), lambda p, s: (p.click('#btnBack'), p.wait_for_timeout(1200)), snap('board')]),
        'A8 TDX 錯誤': ([PA], 'pa', [wait(1500), snap('err')], True),
        'A9 自動重找後查到站被跳過': ([LEAK], 'pl', [wait(1500), snap('before'), quota_at(99000, 2), mark('+100s'), adv(100000), snap('skipped'), mark('+5s'), adv(5000), snap('tick'), mark('+70s'), adv(70000), snap('after')]),
        'A10 沒有金鑰：示範資料與引導': ([PA], 'pa', [lambda p, s: (p.evaluate("() => localStorage.removeItem('bus.cfg')"), p.reload(), p.wait_for_timeout(1500)), snap('demo'), grab('guide', '#guide'), grab('stamp', '#stamp'), mark('+30s'), adv(30000), snap('demo2')]),
        'A11 找不到路線的提示': ([ready('pe', '子站', '丑站', [], 'taichung')], 'pe', [wait(1500), snap('none'), mark('+65s'), adv(65000), snap('none2')]),
        'A12 第二段沒車的警告': ([ready('pn', '子站', '丑站', [R('Taichung', 'C1', 'M1', 'C1-0', 2)], 'taichung', '轉一', [R('Taichung', 'C3', 'M3', 'NONE-0', 2)])], 'pn', [wait(1500), snap('leg1'), click('#legBtn', 600), snap('leg2')]),
        'A13 全部排除': ([dict(PA, exclude=['L1'])], 'pa', [wait(1500), snap('ex'), mark('+65s'), adv(65000), snap('ex2')]),
    },
    'usage': {
        'U1 常用組合自動選': ([PA, PF], 'pa', [wait(1500), usage_snap('open')], False,
                         U(('pf', T0 - D), ('pf', T0 - 2 * D + 30 * 60000), ('pf', T0 - 3 * D - 50 * 60000), ('pa', T0 - D - 3 * 3600000))),
        'U2 平手不選，開上次那組': ([PA, PF], 'pa', [wait(1500), usage_snap('open')], False,
                            U(('pf', T0 - D), ('pf', T0 - 2 * D), ('pf', T0 - 3 * D), ('pa', T0 - D + 60000), ('pa', T0 - 2 * D + 60000), ('pa', T0 - 3 * D + 60000))),
        'U3 假日與 1 小時外的紀錄不算': ([PA, PF], 'pa', [wait(1500), usage_snap('open')], False,
                               U(('pf', T0 - 5 * D), ('pf', T0 - 4 * D), ('pf', T0 - D - 90 * 60000), ('pf', T0 - 2 * D), ('pf', T0 - 31 * D))),
        'U4 停留 20 秒才記、20 分鐘內不重記': ([PA, PF], 'pa', [wait(1500), usage_snap('t0'), adv(15000), usage_snap('t15'), adv(10000), usage_snap('t25'),
                                         adv(10 * 60000), usage_snap('t10m'), adv(15 * 60000), usage_snap('t25m')], False, None),
        'U5 刪除組合一併刪紀錄': ([PA, PF], 'pa', [wait(1500), settings, settings_usage('before'),
                            lambda p, s: (p.click('#pairList button[data-act="del"][data-id="pf"]'), p.click('#pairList button[data-act="del"][data-id="pf"]'), p.wait_for_timeout(500)),
                            settings_usage('after')], False, U(('pf', T0 - D), ('pa', T0 - 2 * D), ('pf', T0 - 3 * D))),
        'U6 清除使用習慣': ([PA, PF], 'pa', [wait(1500), settings, settings_usage('before'),
                         lambda p, s: (p.click('#btnClearUsage'), p.wait_for_timeout(200)), settings_usage('confirm'),
                         lambda p, s: (p.click('#btnClearUsage'), p.wait_for_timeout(300)), settings_usage('after')], False, U(('pf', T0 - D), ('pa', T0 - 2 * D))),
        'U7 壞資料不影響': ([PA, PF], 'pa', [wait(1500), usage_snap('open'), adv(25000), usage_snap('t25')], False,
                        {'bus.usage': [['pf', 'x'], 'bad', ['zz', T0 - D], ['pf'], ['pf', T0 + 99 * D]]}),
        # 開啟時 pf 不在前後 1 小時內（差 75 分鐘），離開 31 分鐘回來後才在範圍內，會被自動選到
        'U8 離開 31 分鐘回來被自動換組合：停留 20 秒記到新組合': ([PA, PF], 'pa', [wait(1500), usage_snap('open'), vis('hidden'), adv(31 * 60000, 300), vis('visible'), wait(1500), usage_snap('back'), adv(25000), usage_snap('t25')], False,
                                                    U(('pf', T0 - D + 75 * 60000), ('pf', T0 - 2 * D + 75 * 60000), ('pf', T0 - 3 * D + 75 * 60000))),
        'U9 從選單切換組合：停留 20 秒記到新組合': ([PA, PF], 'pa', [wait(1500), pick_pair('pf'), usage_snap('switched'), adv(25000), usage_snap('t25')], False, None),
    },
}

def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2
    root, out, groups = argv[1], argv[2], argv[3:] or list(FLOWS)
    bad = [g for g in groups if g not in FLOWS]
    if bad:
        print('不認得的群組：', bad, '，可用：', list(FLOWS))
        return 2
    srv = serve(root)
    result = {}
    with sync_playwright() as pw:
        chrome = os.environ.get('CHROME')
        browser = pw.chromium.launch(executable_path=chrome) if chrome else pw.chromium.launch()
        for g in groups:
            for name, flow in FLOWS[g].items():
                result[name] = run(browser, srv.server_address[1], *flow)
                print(name, '錯誤：' + '; '.join(result[name]['errors']) if result[name]['errors'] else '')
        browser.close()
    srv.shutdown()
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv))
