"""仅访问本地合成测试站，使用全新无账户浏览器；不读取用户浏览器会话。"""
import json
import os
import subprocess
import uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.local-test' / 'screenshots'
OUT.mkdir(parents=True, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    context = browser.new_context(locale='en-US', timezone_id='Asia/Shanghai',
                                  viewport={'width': 390, 'height': 844},
                                  device_scale_factor=2, is_mobile=True, has_touch=True)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_default_timeout(15000)
    passkey = os.environ.get('PERSONAL_TEST_PASSKEY') == '1'
    if passkey:
        cdp = context.new_cdp_session(page)
        cdp.send('WebAuthn.enable')
        cdp.send('WebAuthn.addVirtualAuthenticator', {'options': {
            'protocol': 'ctap2', 'transport': 'internal', 'hasResidentKey': True,
            'hasUserVerification': True, 'isUserVerified': True,
            'automaticPresenceSimulation': True}})
    print('start local synthetic mobile checks', flush=True)
    page.goto('http://localhost:8081', wait_until='networkidle')
    if passkey:
        page.get_by_role('button', name='Create new profile', exact=True).click()
        page.get_by_placeholder('Your name', exact=True).fill('Synthetic-' + uuid.uuid4().hex[:8])
        page.get_by_role('button', name='Create passkey', exact=True).click()
    else:
        page.get_by_role('button', name='Continue without account', exact=True).click()
    page.get_by_role('button', name='个人训练 · 三练一休', exact=True).click()
    page.get_by_role('button', name='创建个人训练计划', exact=True).click()
    page.get_by_role('button', name='开始 / 补录本阶段训练', exact=True).click()
    expect(page.locator('.personal-focus h2')).to_have_text('平板哑铃卧推')
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    for box in page.locator('.personal-focus button, .personal-focus input, .personal-focus select').all():
        if box.is_visible():
            assert box.bounding_box()['height'] >= 44
    page.locator('[aria-label="1-both-RIR"]').select_option('2')
    page.locator('[aria-label="1-both-质量"]').select_option('good')
    page.locator('[aria-label="1-both-完成本组"]').click()
    page.screenshot(path=str(OUT / 'phone-training.png'), full_page=True)
    page.reload(wait_until='networkidle')
    expect(page.locator('[aria-label="1-both-撤销完成"]')).to_be_visible()
    expect(page.locator('[role=timer]')).to_contain_text('休息')
    print('reload passed', flush=True)
    # PWA 的网络断开恢复；仅使用本次生成的草稿。
    page.wait_for_function('navigator.serviceWorker.controller !== null', timeout=15000)
    context.set_offline(True)
    page.reload(wait_until='networkidle')
    expect(page.locator('[aria-label="1-both-撤销完成"]')).to_be_visible()
    page.locator('[aria-label="1-both-次数"]').fill('11')
    page.locator('.personal-focus h2').click()
    context.set_offline(False)
    page.reload(wait_until='networkidle')
    expect(page.locator('[aria-label="1-both-次数"]')).to_have_value('11')
    print('offline round trip passed', flush=True)
    for index in range(4):
        tries = 0
        while page.locator('button[aria-label$="完成本组"]').count():
            tries += 1
            assert tries < 10, page.locator('body').inner_text()
            page.locator('button[aria-label$="完成本组"]').first.click()
        print(f'exercise {index + 1} completed', flush=True)
        if index < 3:
            page.get_by_role('button', name='下一动作', exact=True).click()
    finish = page.get_by_role('button', name='完成训练并推进循环', exact=True)
    expect(finish).to_be_enabled()
    finish.click()
    expect(page.locator('.personal-next h2')).to_have_text('Pull')
    expect(page.get_by_text('Push 已记录', exact=True)).to_be_visible()
    if passkey:
        # 等待原有同步队列真正落盘，再验证退出和重新登录；不以本机 UI 代替服务端证据。
        synced = False
        for _ in range(20):
            remote = page.request.get('http://localhost:8081/api/data').json().get('state') or {}
            if remote.get('personalEvents') and remote.get('workouts'):
                synced = True
                break
            page.wait_for_timeout(500)
        assert synced, '完成记录尚未同步到隔离 API'
    if os.environ.get('PERSONAL_TEST_DOCKER_RESTART') == '1':
        # 仅固定的隔离项目，不接受外部容器/项目名。
        subprocess.run(['docker', 'compose', '-p', 'opengym-dev', '-f', 'deploy/personal/compose.yml', 'restart'], cwd=ROOT, check=True)
        subprocess.run(['node', 'scripts/personal/wait-health.mjs'], cwd=ROOT, check=True)
        page.reload(wait_until='networkidle')
        expect(page.locator('.personal-next h2')).to_have_text('Pull')
    if passkey:
        # 全新测试浏览器内重新登录，虚拟认证器留在内存，不导出 Cookie 或凭据。
        context.clear_cookies()
        page.evaluate('localStorage.clear()')
        page.reload(wait_until='networkidle')
        page.get_by_role('button', name='Sign in with passkey', exact=True).click()
        expect(page.locator('.personal-next h2')).to_have_text('Pull')
    page.screenshot(path=str(OUT / 'phone-summary.png'), full_page=True)
    page.get_by_role('button', name='器材', exact=True).first.click()
    expect(page.locator('.personal-loads article')).to_have_count(12)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    page.screenshot(path=str(OUT / 'phone-equipment.png'), full_page=True)
    page.set_viewport_size({'width': 1280, 'height': 900})
    page.screenshot(path=str(OUT / 'desktop-equipment.png'), full_page=True)
    assert not errors, errors
    result = {'ok': True, 'engine': 'Chromium touch emulation, not Safari device',
              'virtualPasskeyRegistrationAndLogin': passkey,
              'dockerRestart': os.environ.get('PERSONAL_TEST_DOCKER_RESTART') == '1',
              'viewport': '390x844', 'planCreation': True, 'setInput': True,
              'reloadRecovery': True, 'offlineRecovery': True, 'cycleAdvancement': True,
              'summary': True, 'inventory': True, 'horizontalOverflow': False,
              'minTouchHeight': 44, 'pageErrors': errors, 'screenshots': str(OUT)}
    (OUT / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
    browser.close()
