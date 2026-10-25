"""仅访问本地合成测试站，使用全新无账户浏览器；不读取用户浏览器会话。"""
import json
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
    page.goto('http://localhost:8081', wait_until='networkidle')
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
    for index in range(4):
        for button in page.locator('button[aria-label$="完成本组"]').all():
            button.click()
        if index < 3:
            page.get_by_role('button', name='下一动作', exact=True).click()
    finish = page.get_by_role('button', name='完成训练并推进循环', exact=True)
    expect(finish).to_be_enabled()
    finish.click()
    expect(page.locator('.personal-next h2')).to_have_text('Pull')
    expect(page.get_by_text('Push 已记录', exact=True)).to_be_visible()
    page.screenshot(path=str(OUT / 'phone-summary.png'), full_page=True)
    page.get_by_role('button', name='器材', exact=True).first.click()
    expect(page.locator('.personal-loads article')).to_have_count(12)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    page.screenshot(path=str(OUT / 'phone-equipment.png'), full_page=True)
    page.set_viewport_size({'width': 1280, 'height': 900})
    page.screenshot(path=str(OUT / 'desktop-equipment.png'), full_page=True)
    assert not errors, errors
    result = {'ok': True, 'engine': 'Chromium touch emulation, not Safari device',
              'viewport': '390x844', 'planCreation': True, 'setInput': True,
              'reloadRecovery': True, 'offlineRecovery': True, 'cycleAdvancement': True,
              'summary': True, 'inventory': True, 'horizontalOverflow': False,
              'minTouchHeight': 44, 'pageErrors': errors, 'screenshots': str(OUT)}
    (OUT / 'result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))
    browser.close()
