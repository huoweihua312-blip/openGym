"""仅测试明确指定的 NAS 私网 8081；全新合成账户，密码/Cookie 不输出、不落盘。"""
import ipaddress
import json
import os
import secrets
import uuid
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

base = os.environ['PERSONAL_NAS_TEST_URL'].rstrip('/')
url = urlparse(base)
address = ipaddress.ip_address(url.hostname)
assert url.scheme == 'http' and url.port == 8081 and address.version == 4
assert address.is_private and not address.is_loopback and not address.is_link_local
assert not url.username and not url.password and not url.query and not url.fragment and not url.path
out = Path(__file__).resolve().parents[2] / '.local-test' / 'nas-browser'
out.mkdir(parents=True, exist_ok=True)
name = 'SyntheticLAN-' + uuid.uuid4().hex[:8]
password = secrets.token_urlsafe(24)
with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    context = browser.new_context(locale='en-US', timezone_id='Asia/Shanghai', viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
    page = context.new_page()
    page.set_default_timeout(15000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(base, wait_until='networkidle')
    cfg = page.request.get(base + '/api/config').json()
    assert cfg.get('password_login') is True and cfg.get('allow_guest') is False
    page.get_by_role('button', name='Create new profile', exact=True).click()
    page.get_by_placeholder('Your name', exact=True).fill(name)
    page.get_by_placeholder('Password', exact=True).fill(password)
    page.get_by_placeholder('Repeat the password', exact=True).fill(password)
    page.get_by_role('button', name='Create profile', exact=True).click()
    page.get_by_role('button', name='个人训练 · 三练一休', exact=True).click()
    page.get_by_role('button', name='创建个人训练计划', exact=True).click()
    page.get_by_role('button', name='开始 / 补录本阶段训练', exact=True).click()
    expect(page.locator('.personal-focus h2')).to_have_text('平板哑铃卧推')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    page.locator('[aria-label="1-both-RIR"]').select_option('2')
    page.locator('[aria-label="1-both-质量"]').select_option('good')
    page.locator('[aria-label="1-both-完成本组"]').click()
    page.reload(wait_until='networkidle')
    expect(page.locator('[aria-label="1-both-撤销完成"]')).to_be_visible()
    page.screenshot(path=str(out / 'phone-training.png'), full_page=True)
    for index in range(4):
        tries = 0
        while page.locator('button[aria-label$="完成本组"]').count():
            tries += 1
            assert tries < 10
            page.locator('button[aria-label$="完成本组"]').first.click()
        if index < 3:
            page.get_by_role('button', name='下一动作', exact=True).click()
    page.get_by_role('button', name='完成训练并推进循环', exact=True).click()
    expect(page.locator('.personal-next h2')).to_have_text('Pull')
    synced = False
    for _ in range(30):
        state = page.request.get(base + '/api/data').json().get('state') or {}
        if state.get('personalEvents') and state.get('workouts'):
            synced = True
            break
        page.wait_for_timeout(500)
    assert synced
    coach = page.request.get(base + '/api/config').json().get('coach')
    # 只记录是否启用；不获取管理员配置、Key 或调用任何模型。
    coach_enabled = bool(coach and coach.get('enabled'))
    context.clear_cookies()
    page.evaluate('localStorage.clear()')
    page.reload(wait_until='networkidle')
    page.get_by_role('button', name='Sign in with password', exact=True).click()
    page.get_by_placeholder('Name or e-mail', exact=True).fill(name)
    page.get_by_placeholder('Password', exact=True).fill(password)
    page.locator('form button[type=submit]').click()
    expect(page.locator('.personal-next h2')).to_have_text('Pull')
    page.get_by_role('button', name='器材', exact=True).first.click()
    expect(page.locator('.personal-loads article')).to_have_count(12)
    page.screenshot(path=str(out / 'phone-equipment.png'), full_page=True)
    assert not errors, errors
    result = {'ok': True, 'actualNasLan': True, 'syntheticOnly': True, 'passwordRegistrationAndRelogin': True,
              'planCreation': True, 'setInput': True, 'reloadRecovery': True, 'serverSaved': True,
              'pushToPull': True, 'inventory': True, 'viewport': '390x844', 'pageErrors': errors,
              'secureContext': page.evaluate('isSecureContext'), 'coachEnabled': coach_enabled,
              'realAiCalls': 0, 'iPhoneRealDevice': False, 'pwaOffline': 'not-tested-http'}
    (out / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
    browser.close()
