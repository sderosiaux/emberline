import type { App, Screen } from '../app'
import { h, fmt } from './dom'
import { Nav } from './nav'
import { audio } from '../audio/audio'
import { ITEMS, ITEM, upgradeCost, sellValue, type ItemDef } from '../data/items'
import { buy, upgrade, sell, isAvailable, netPrice, ownedAt, shipStats, SLOT_FOR, type Campaign, type SlotKey } from '../game/campaign'
import { nextMissionId } from '../game/progress'
import { MISSIONS } from '../data/missions'
import * as save from '../game/save'
import { WeaponPreview } from './preview'
import { powerBudget } from '../game/power'

const SLOTS: { key: SlotKey; label: string }[] = [
  { key: 'front', label: 'Front gun' },
  { key: 'rear', label: 'Rear / aux' },
  { key: 'podL', label: 'Left pod' },
  { key: 'podR', label: 'Right pod' },
  { key: 'reactor', label: 'Reactor' },
  { key: 'shield', label: 'Shield' },
  { key: 'hull', label: 'Hull plating' },
  { key: 'special', label: 'Special' },
]

const GREET = [
  "Credits first, questions never. What are we bolting on?",
  "You brought the ship back in one piece. Mostly one piece.",
  "New stock came in. Some of it even works.",
  "Don't touch the red one. Buy it, then touch it.",
  "The reactor is the part everyone forgets. Everyone who dies.",
]

/**
 * Dasha's hangar: slot list → catalogue → detail with level track, plus a live
 * weapon preview and a power budget so reactor/weapon tradeoffs are visible.
 * All changes during one visit can be reverted with "Undo visit".
 */
export function hangarScreen(app: App): Screen {
  const snapshot: Campaign = structuredClone(app.campaign!)
  let slot: SlotKey = 'front'
  let selected: string = app.campaign!.loadout.front.id
  let say = app.campaign!.completed.length <= 1 && !app.campaign!.detour
    ? "First time? Pick a slot on the left, a part in the middle. Upgrades change how a gun fires, not just how hard. Watch the power bar — the reactor feeds everything."
    : GREET[Math.floor(Math.random() * GREET.length)]
  let toastT = 0

  const creditsEl = h('span', { class: 'mono' })
  const deltaEl = h('div', { class: 'delta' })
  const slotsEl = h('div', { class: 'slots' })
  const cardsEl = h('div', { class: 'cards' })
  const detailEl = h('div', { class: 'detail' })
  const catTitle = h('div', { class: 'kicker', style: 'margin-bottom:10px' })
  const sayEl = h('div', { class: 'say' })
  const toast = h('div', { class: 'toast', style: 'opacity:0' })
  const powerEl = h('div', { class: 'power' })
  const canvas = h('canvas', { class: 'preview', width: 688, height: 500 })
  const previewNote = h('div', { style: 'font-size:12px;color:var(--muted)' })
  const preview = new WeaponPreview(canvas)

  const nextId = nextMissionId(app.campaign!)
  const next = nextId ? MISSIONS[nextId] : null

  const el = h('div', { class: 'screen paper' },
    h('div', { class: 'hangar' },
      h('div', { class: 'hg-head' },
        h('div', null, h('div', { class: 'kicker' }, 'Dasha\'s salvage & arms'), h('h2', null, 'HANGAR')),
        next ? h('div', { style: 'font-size:13px;color:var(--ink2)' }, h('div', { class: 'kicker' }, 'Next'), `Mission ${next.num} · ${next.name}`) : null,
        h('div', { class: 'credits-big' }, h('div', { class: 'kicker' }, 'Credits'), creditsEl, deltaEl),
      ),
      h('div', { class: 'hg-body' },
        slotsEl,
        h('div', { class: 'catalog' }, catTitle, cardsEl, detailEl),
        h('div', { class: 'preview-col' },
          h('div', { class: 'kicker' }, 'Test range'), canvas, previewNote,
          h('div', { class: 'kicker', style: 'margin-top:6px' }, 'Power budget'), powerEl,
        ),
      ),
      h('div', { class: 'hg-foot' },
        h('button', { class: 'btn nav primary', onClick: () => { audio.sfx('ui_select'); commit(); app.toBriefing() } }, h('span', null, 'Briefing & launch'), h('span', { class: 'hint' }, 'L')),
        h('button', { class: 'btn nav', onClick: () => undoVisit() }, h('span', null, 'Undo visit')),
        h('button', { class: 'btn nav', onClick: () => { audio.sfx('ui_select'); commit(); app.toTitle() } }, h('span', null, 'Title')),
        sayEl,
      ),
    ),
    toast,
  )

  const nav = new Nav(el)

  function c() { return app.campaign! }
  function set(nc: Campaign) { app.campaign = nc; save.saveCampaign(nc) }
  function commit() { save.saveCampaign(c()) }
  function flash(msg: string) { toast.textContent = msg; toast.style.opacity = '1'; toastT = 1.6 }

  function undoVisit() {
    set(structuredClone(snapshot))
    audio.sfx('ui_back')
    flash('All changes from this visit reverted')
    render()
  }

  function doBuy(id: string, into: SlotKey) {
    const r = buy(c(), id, into)
    if (!r.ok) { audio.sfx('ui_deny'); flash(r.reason); return }
    set(r.campaign)
    audio.sfx('ui_buy')
    say = ITEM[id].quip
    flash(`${ITEM[id].name} installed`)
    render()
  }
  function doUpgrade(into: SlotKey) {
    const r = upgrade(c(), into)
    if (!r.ok) { audio.sfx('ui_deny'); flash(r.reason); return }
    set(r.campaign)
    audio.sfx('ui_upgrade')
    const o = ownedAt(c().loadout, into)!
    const d = ITEM[o.id]
    flash(`${d.name} → level ${o.level}: ${d.levels?.[o.level - 1] ?? ''}`)
    render()
  }
  function doSell(into: SlotKey) {
    const r = sell(c(), into)
    if (!r.ok) { audio.sfx('ui_deny'); flash(r.reason); return }
    set(r.campaign)
    audio.sfx('ui_sell')
    render()
  }

  function slotItems(k: SlotKey): ItemDef[] {
    const slotType = SLOTS.find((s) => s.key === k)!.key
    return ITEMS.filter((i) => SLOT_FOR[i.slot].includes(slotType) && (isAvailable(c(), i) || !i.core))
  }

  function render() {
    const cc = c()
    creditsEl.textContent = fmt(cc.credits)
    const spent = snapshot.credits - cc.credits
    deltaEl.textContent = spent === 0 ? 'unchanged this visit' : spent > 0 ? `−${fmt(spent)} this visit` : `+${fmt(-spent)} this visit`
    sayEl.textContent = `“${say}”`

    // slots
    slotsEl.innerHTML = ''
    slotsEl.append(h('div', { class: 'kicker', style: 'margin:2px 2px 6px' }, 'Kestrel'))
    for (const s of SLOTS) {
      const o = ownedAt(cc.loadout, s.key)
      const d = o ? ITEM[o.id] : null
      const node = h('div', { class: `slot nav${slot === s.key ? ' sel' : ''}` },
        h('div', { class: 'k' }, s.label),
        h('div', { class: `n${d ? '' : ' empty'}` }, d ? d.name : 'empty', d && d.maxLevel > 1 ? pips(o!.level, d.maxLevel) : null),
      )
      node.addEventListener('click', () => {
        audio.sfx('ui_select')
        slot = s.key
        selected = o?.id ?? slotItems(slot).find((i) => isAvailable(cc, i))?.id ?? ''
        render()
        const card = cardsEl.querySelector('.card') as HTMLElement | null
        if (card) nav.focus(card)
      })
      node.addEventListener('navfocus', () => { if (slot !== s.key) { slot = s.key; selected = o?.id ?? slotItems(slot).find((i) => isAvailable(cc, i))?.id ?? ''; renderCatalog() } })
      slotsEl.append(node)
    }
    renderCatalog()
  }

  function renderCatalog() {
    const cc = c()
    const label = SLOTS.find((s) => s.key === slot)!.label
    catTitle.textContent = `${label} — catalogue`
    cardsEl.innerHTML = ''
    const cur = ownedAt(cc.loadout, slot)
    for (const it of slotItems(slot)) {
      const avail = isAvailable(cc, it)
      const installed = cur?.id === it.id
      const price = installed ? 0 : netPrice(cc, it.id, slot)
      const card = h('div', { class: `card nav${installed ? ' installed' : ''}${avail ? '' : ' locked'}` },
        h('div', { class: 'nm' }, it.name),
        h('div', { class: `pr${avail && !installed && price > cc.credits ? ' cant' : ''}` },
          !avail ? `in stock after mission ${it.unlock}` : installed ? 'installed' : price >= 0 ? `${fmt(price)}c` : `+${fmt(-price)}c`),
        installed ? h('span', { class: 'tag' }, 'ON') : it.tags?.includes('prototype') ? h('span', { class: 'tag proto' }, 'PROTO') : null,
      )
      card.addEventListener('navfocus', () => { selected = it.id; renderDetail() })
      card.addEventListener('mouseenter', () => { selected = it.id; renderDetail() })
      card.addEventListener('click', () => {
        selected = it.id
        if (!avail) { audio.sfx('ui_deny'); flash('Not in stock yet'); return }
        if (installed) { if (it.maxLevel > 1) doUpgrade(slot); else { audio.sfx('ui_deny'); flash('Already installed') } }
        else doBuy(it.id, slot)
      })
      cardsEl.append(card)
    }
    if (slot !== 'front' && slot !== 'reactor' && slot !== 'shield' && slot !== 'hull' && cur) {
      const sellCard = h('div', { class: 'card nav' }, h('div', { class: 'nm' }, 'Remove'), h('div', { class: 'pr' }, `sell for ${fmt(sellValue(ITEM[cur.id], cur.level))}c`))
      sellCard.addEventListener('click', () => doSell(slot))
      sellCard.addEventListener('navfocus', () => { selected = cur.id; renderDetail() })
      cardsEl.append(sellCard)
    }
    renderDetail()
  }

  function renderDetail() {
    const cc = c()
    detailEl.innerHTML = ''
    const it = ITEM[selected]
    if (!it) { renderPower(); return }
    const cur = ownedAt(cc.loadout, slot)
    const installed = cur?.id === it.id
    const lvl = installed ? cur!.level : 0
    const left = h('div', null,
      h('div', { class: 'kicker' }, it.tags?.includes('prototype') ? 'Prototype' : it.slot),
      h('h3', null, it.name),
      h('p', { class: 'blurb' }, it.blurb),
      h('p', { class: 'quip' }, it.quip),
      statLines(it),
    )
    const right = h('div', null)
    const actions = h('div', { class: 'actions', style: 'margin:0 0 12px' })
    right.append(actions)
    if (it.levels) {
      right.append(h('div', { class: 'kicker', style: 'margin-bottom:6px' }, 'Upgrade track'))
      const lv = h('div', { class: 'levels' })
      it.levels.forEach((txt, i) => {
        const n = i + 1
        const cls = installed && n <= lvl ? 'have' : installed && n === lvl + 1 ? 'next' : ''
        const cost = installed && n === lvl + 1 ? `${fmt(upgradeCost(it, lvl))}c` : n === 1 ? '' : ''
        lv.append(h('div', { class: `lv ${cls}` }, h('b', null, n), h('span', null, txt), h('b', null, cost)))
      })
      right.append(lv)
    }
    if (installed && it.maxLevel > 1 && lvl < it.maxLevel) {
      const cost = upgradeCost(it, lvl)
      actions.append(h('button', { class: `btn small nav${cost <= cc.credits ? ' primary' : ''}`, onClick: () => doUpgrade(slot) }, h('span', null, `Upgrade to ${lvl + 1} · ${fmt(cost)}c`)))
    } else if (!installed && isAvailable(cc, it)) {
      const p = netPrice(cc, it.id, slot)
      actions.append(h('button', { class: `btn small nav${p <= cc.credits ? ' primary' : ''}`, onClick: () => doBuy(it.id, slot) }, h('span', null, p >= 0 ? `Buy · ${fmt(p)}c` : `Swap · +${fmt(-p)}c`)))
      if (cur) actions.append(h('div', { style: 'font-size:11px;color:var(--muted);align-self:center' }, `includes trade-in of ${ITEM[cur.id].name}`))
    }
    if (installed && lvl >= it.maxLevel && it.maxLevel > 1) actions.append(h('span', { class: 'pill' }, 'Fully upgraded'))
    detailEl.append(left, right)
    // preview: show the weapon being inspected at the level it would have
    preview.show(cc.loadout, slot, it.id, installed ? lvl : 1)
    previewNote.textContent = it.slot === 'front' || it.slot === 'rear' || it.slot === 'pod' || it.slot === 'special'
      ? `${it.name}${it.maxLevel > 1 ? ` · level ${installed ? lvl : 1}` : ''} on your current ship`
      : 'Showing your current armament'
    renderPower(it)
  }

  function renderPower(it?: ItemDef) {
    const cc = c()
    const cur = powerBudget(cc.loadout)
    let hyp = cur
    if (it && ITEM[it.id] && ownedAt(cc.loadout, slot)?.id !== it.id) {
      const l = structuredClone(cc.loadout)
      const o = { id: it.id, level: 1 }
      if (slot === 'front') l.front = o
      else if (slot === 'rear') l.rear = o
      else if (slot === 'podL') l.podL = o
      else if (slot === 'podR') l.podR = o
      else if (slot === 'reactor') l.reactor = it.id
      else if (slot === 'shield') l.shield = it.id
      else if (slot === 'hull') l.hull = it.id
      else l.special = it.id
      hyp = powerBudget(l)
    }
    powerEl.innerHTML = ''
    const row = (b: ReturnType<typeof powerBudget>, title: string) => {
      const max = Math.max(b.output, b.draw) * 1.1
      const ok = b.draw <= b.output
      powerEl.append(
        h('div', { class: 'stat-row', style: 'padding:3px 0;border:none' }, h('span', null, title), h('b', { class: ok ? '' : 'warn' }, `${Math.round(b.draw)} / ${Math.round(b.output)} E/s`)),
        h('div', { class: 'pbar' },
          h('i', { style: `width:${(b.weapons / max) * 100}%;background:var(--ember)` }),
          h('i', { style: `left:${(b.weapons / max) * 100}%;width:${(b.shield / max) * 100}%;background:var(--shield)` }),
          h('i', { style: `left:${(b.output / max) * 100}%;width:2px;background:var(--ink)` }),
        ),
      )
    }
    row(cur, 'Current ship')
    if (hyp !== cur) row(hyp, 'With this item')
    const st = shipStats(cc.loadout)
    powerEl.append(
      h('div', { class: 'legend' }, h('span', null, '■ weapons  ■ shield regen'), h('span', null, '| reactor')),
      h('div', { class: 'statlines' },
        h('div', { class: 'stat-row' }, h('span', null, 'Hull'), h('b', null, `${st.hull}`)),
        h('div', { class: 'stat-row' }, h('span', null, 'Shield'), h('b', null, `${st.shieldCap} · +${st.shieldRegen}/s`)),
        h('div', { class: 'stat-row' }, h('span', null, 'Reactor reserve'), h('b', null, `${st.capacity} E`)),
        cur.draw > cur.output ? h('p', { class: 'warn', style: 'margin-top:6px;font-size:12px' }, 'Your guns draw more than the reactor makes: sustained fire will stutter once the reserve drains.') : null,
      ),
    )
  }

  function pips(l: number, m: number) {
    return h('span', { class: 'pips' }, Array.from({ length: m }, (_, i) => h('i', { class: i < l ? 'on' : '' })))
  }

  function statLines(it: ItemDef) {
    const rows: [string, string][] = []
    if (it.output) rows.push(['Output', `${it.output} E/s`], ['Reserve', `${it.capacity} E`])
    if (it.shieldCap !== undefined) rows.push(['Capacity', `${it.shieldCap}`], ['Regen', it.shieldRegen ? `${it.shieldRegen}/s after ${it.shieldDelay}s` : 'on kills only'], ['Power per point', `${it.shieldCost}`])
    if (it.hull) rows.push(['Hull', `${it.hull}`], ['Speed', `${Math.round((it.speedMul ?? 1) * 100)}%`])
    if (it.specialCost) rows.push(['Charge needed', `${it.specialCost}%`])
    if (!rows.length) return null
    return h('div', { class: 'statlines' }, rows.map(([k, v]) => h('div', { class: 'stat-row' }, h('span', null, k), h('b', null, v))))
  }

  nav.onBack = () => { commit(); app.toBriefing() }
  nav.onAction = (a) => {
    if (a === 'tabPrev' || a === 'tabNext') {
      const i = SLOTS.findIndex((s) => s.key === slot)
      const n = SLOTS[(i + (a === 'tabNext' ? 1 : -1) + SLOTS.length) % SLOTS.length]
      slot = n.key
      selected = ownedAt(c().loadout, slot)?.id ?? slotItems(slot).find((x) => isAvailable(c(), x))?.id ?? ''
      render()
      audio.sfx('ui_move')
      return true
    }
    return false
  }
  const keyL = (e: KeyboardEvent) => { if (e.code === 'KeyL') { commit(); app.toBriefing() } }
  window.addEventListener('keydown', keyL)

  render()
  return {
    el, nav, backdrop: 'paper',
    update(dt) {
      preview.update(dt)
      preview.draw()
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) toast.style.opacity = '0' }
    },
    dispose() { window.removeEventListener('keydown', keyL); preview.dispose() },
  }
}
