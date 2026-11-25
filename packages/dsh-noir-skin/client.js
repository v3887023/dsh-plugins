/**
 * Client half of the Noir Skin bundle.
 *
 * The look is one `ctx.theme.overrideTokens` layer: the alias tokens the shipped
 * palettes define on `body` are re-pointed at a graphite + champagne ramp, so
 * every surface, hairline, code block and state colour in the shell follows
 * without touching a host stylesheet. The layer is disposable, so switching the
 * skin off restores exactly what DSH shipped.
 *
 * Accents are a second, narrower set on top of the same layer: the emphasis
 * family (focus ring, links, selection, trajectory) moves together, so no single
 * control keeps a stray blue when the palette turns warm.
 *
 * The dark ramp is parametric: four values (canvas depth, surface separation,
 * accent lightness, hairline weight) generate the surface tokens. The controls
 * are a tab type in the right sidebar (`ctx.sidebarRightTabs` +
 * `sidebar.right.pane.tab`), so dragging them keeps the conversation on screen,
 * and the guide offers the tab as a card beside Files and Terminal.
 *
 * The preference lives in localStorage: one browser, one look, no profile
 * writes, and the shell's own light/dark preference still owns the palette.
 */
window.__ModuleLoader__.load({
  id: '@v3887023/dsh-noir-skin',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect } = React;

    /** Layer identity: also the name `overrideTokens` keeps for this source. */
    const LAYER = '@v3887023/dsh-noir-skin';

    /** Right-sidebar tab identity: the type id, its kind, and the guide card. */
    const TYPE_ID = '@v3887023/dsh-noir-skin/panel';
    const KIND = 'noir-skin';

    const KEY_ENABLED = 'dsh.noir-skin.enabled';
    const KEY_ACCENT = 'dsh.noir-skin.accent';
    const KEY_TUNING = 'dsh.noir-skin.tuning';
    const KEY_TYPE = 'dsh.noir-skin.type';
    const KEY_STRONG = 'dsh.noir-skin.strong';
    const KEY_INLINE = 'dsh.noir-skin.inline';
    const KEY_FENCE = 'dsh.noir-skin.fence';
    const KEY_TABLE = 'dsh.noir-skin.table';
    const KEY_OL = 'dsh.noir-skin.ol';
    const KEY_UL = 'dsh.noir-skin.ul';
    const KEY_QUOTE = 'dsh.noir-skin.quote';

    /**
     * Accent families. Hue and saturation come from the colour's own standard
     * value — the Chinese traditional names below are the traditional swatches —
     * and `darkL` records the lightness that colour needs on the graphite canvas
     * (the traditional swatches are drawn for paper, so several must be lifted).
     * `lightL` is the ink value used on the light palette.
     *
     * The accent-lightness slider applies as an offset from 60, so it still
     * tunes every family together while each keeps its own character.
     */
    const ACCENTS = {
      gold: { h: 36, s: 45, lightS: 40, lightL: 38.6, darkL: 60 },
      copper: { h: 22, s: 55, lightS: 50, lightL: 40, darkL: 60 },
      teal: { h: 171, s: 32, lightS: 36, lightL: 32, darkL: 60 },
      // 赭石 #845A33
      ochre: { h: 28, s: 45, lightS: 40, lightL: 32, darkL: 52 },
      // 橄榄 #6B6B47
      olive: { h: 60, s: 30, lightS: 30, lightL: 34, darkL: 52 },
      // 秋香色 #D9B611
      autumn: { h: 50, s: 60, lightS: 55, lightL: 40, darkL: 52 },
      // 藤黄 #FFB61E
      gamboge: { h: 40, s: 62, lightS: 52, lightL: 40, darkL: 52 },
      // 竹青 #789262
      bamboo: { h: 92, s: 20, lightS: 26, lightL: 36, darkL: 50 },
      // 碧色 #1BD1A5
      jade: { h: 165, s: 77, lightS: 52, lightL: 38, darkL: 47 },
      // 天青 #78B9C0
      sky: { h: 186, s: 36, lightS: 34, lightL: 40, darkL: 61 },
      // 靛青 #177CB0
      indigo: { h: 200, s: 77, lightS: 52, lightL: 36, darkL: 47 },
      // 黛蓝 #425066
      dai: { h: 217, s: 21, lightS: 28, lightL: 32, darkL: 55 },
      // 青莲 #8D4BBB
      lotus: { h: 275, s: 45, lightS: 40, lightL: 44, darkL: 53 },
      // 琥珀 #CA6924
      amber: { h: 30, s: 70, lightS: 55, lightL: 36, darkL: 52 },
      // 杏黄 #FFA400
      apricot: { h: 39, s: 62, lightS: 58, lightL: 40, darkL: 54 },
      // 柳黄 #C9DD22
      willow: { h: 68, s: 60, lightS: 55, lightL: 42, darkL: 54 },
      // 香色 #D2B258
      incense: { h: 45, s: 50, lightS: 45, lightL: 42, darkL: 56 },
      // 绛紫 #8C4356
      aubergine: { h: 345, s: 40, lightS: 35, lightL: 34, darkL: 50 },
    };

    /**
     * Tuning ranges for the dark ramp. Defaults reproduce the hand-set palette,
     * so "reset" lands on the look this bundle was drawn as.
     */
    const TUNING_DEFAULT = { depth: 8, contrast: 2.8, accentL: 60, hairline: 7, strongL: 48, textL: 80, lightL: 97 };
    const TUNING_RANGE = {
      depth: { min: 4.2, max: 9.5, step: 0.1 },
      contrast: { min: 1.6, max: 4.5, step: 0.1 },
      accentL: { min: 50, max: 72, step: 0.5 },
      hairline: { min: 4, max: 12, step: 0.5 },
      strongL: { min: 35, max: 70, step: 0.5 },
      textL: { min: 84, max: 96, step: 0.1 },
      lightL: { min: 76, max: 100, step: 0.1 },
    };

    /**
     * Conversation typography presets. `off` leaves the transcript untouched.
     *
     * Three knobs ride CSS variables on `body`: the message column width (the
     * shell reads `--dsh-chat-user-width` before its clamp), the base line
     * height, and the block gap between markdown blocks. The structural flags
     * (heading rule, numbered badges, quote card, table zebra) switch rules
     * published under `body[data-noir-type="…"]`, so an inactive preset costs
     * nothing.
     *
     * Line height and block gap live on the shipped `_root` / `_body` CSS module
     * classes; those are hash-prefixed, so the rules below reach them by class
     * substring inside a chat-node scope and use `!important`. If a DSH upgrade
     * renames the modules the rules stop matching and the transcript simply
     * falls back to the shipped typography.
     */
    const TYPES = {
      off: null,
      compact: { line: '26px', gap: '16px', width: '748px', rule: false, badge: false, quote: 'line', zebra: false },
      reading: { line: '28px', gap: '22px', width: '700px', rule: false, badge: false, quote: 'line', zebra: false },
      structure: { line: '30px', gap: '28px', width: '660px', rule: true, badge: true, quote: 'card', zebra: true },
      document: { line: '34px', gap: '40px', width: '600px', rule: true, badge: true, quote: 'card', zebra: true },
    };
    const TYPE_ORDER = ['off', 'compact', 'reading', 'structure', 'document'];

    /**
     * Bold-text colours for conversation Markdown. `accent` follows the accent
     * family and its lightness slider; the rest are fixed light/dark pairs.
     * `off` leaves `strong` inheriting the paragraph colour, as shipped.
     */
    const STRONG_PRESETS = {
      gold: { light: '#8A6D3B', dark: '#C9A86A' },
      blue: { light: '#2F5CF6', dark: '#8FA6FF' },
      warm: { light: '#A85A2A', dark: '#D89A6A' },
    };
    const STRONG_ORDER = ['off', 'accent', 'gold', 'blue', 'warm'];

    /** Content-block styles: quote, code fence and table treatments. */
    /** Content-block styles, one axis each: quote, code fence and table. */
    const INLINE_ORDER = ['plain', 'outline', 'accent'];
    const FENCE_ORDER = ['plain', 'outline', 'tight'];
    const TABLE_ORDER = ['plain', 'zebra', 'header'];
    const OL_ORDER = ['native', 'accent', 'badge'];
    const UL_ORDER = ['native', 'accent', 'dash'];
    const QUOTE_ORDER = ['plain', 'bar', 'soft', 'quote'];

    /** HSL → RGB triplet. Kept local so no dependency is needed. */
    function hslToRgb(hue, sat, light) {
      const s = sat / 100;
      const l = light / 100;
      const c = (1 - Math.abs(2 * l - 1)) * s;
      const segment = (((hue % 360) + 360) % 360) / 60;
      const x = c * (1 - Math.abs((segment % 2) - 1));
      let r = 0;
      let g = 0;
      let b = 0;
      if (segment < 1) {
        r = c;
        g = x;
      } else if (segment < 2) {
        r = x;
        g = c;
      } else if (segment < 3) {
        g = c;
        b = x;
      } else if (segment < 4) {
        g = x;
        b = c;
      } else if (segment < 5) {
        r = x;
        b = c;
      } else {
        r = c;
        b = x;
      }
      const m = l - c / 2;
      return [
        Math.round((r + m) * 255),
        Math.round((g + m) * 255),
        Math.round((b + m) * 255),
      ];
    }

    /** HSL → `#RRGGBB`. */
    function hslToHex(hue, sat, light) {
      const rgb = hslToRgb(hue, sat, light);
      return (
        '#' +
        rgb
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('')
          .toUpperCase()
      );
    }

    /** HSL → `rgba(...)` for low-alpha washes. */
    function hslToRgba(hue, sat, light, alpha) {
      const rgb = hslToRgb(hue, sat, light);
      return 'rgba(' + rgb[0] + ', ' + rgb[1] + ', ' + rgb[2] + ', ' + alpha + ')';
    }

    /**
     * Fixed light palette. Only `--dsw-alias-*` and `--dsw-specific-*` tokens are
     * listed; the static ramp stays untouched so anything the system derives
     * from it keeps working. The dark column is the fallback used when the dark
     * ramp does not cover a token.
     */
    const BASE = {
      '--dsw-alias-bg-base': ['#FAF8F3', '#0E0E10'],
      '--dsw-alias-bg-layer-1': ['#FFFFFF', '#18181B'],
      '--dsw-alias-bg-layer-2': ['#F4F1EA', '#202024'],
      '--dsw-alias-bg-layer-3': ['#EDE9E0', '#28282D'],
      '--dsw-alias-bg-overlay': ['#F4F1EA', '#202024'],
      '--dsw-alias-bg-module-platform': ['#F1EDE4', '#232327'],
      '--dsw-alias-bg-multi-select': ['#F4F1EA', '#1A1A1E'],
      '--dsw-alias-bg-skeleton': ['rgba(28, 27, 24, 0.05)', 'rgba(255, 255, 255, 0.06)'],
      '--dsw-alias-bg-document-preview': ['#F6F3EC', '#131315'],

      '--dsw-alias-label-primary': ['#1C1B18', '#F2EFE9'],
      '--dsw-alias-label-secondary': ['#5F5A51', '#A19C93'],
      '--dsw-alias-label-tertiary': ['#857F73', '#8B8577'],
      '--dsw-alias-label-caption': ['#857F73', '#8B8577'],
      '--dsw-alias-label-dimmed': ['#C9C2B4', '#3A3A40'],
      '--dsw-alias-label-primary-dimmed': ['#2E2C27', '#D9D4CA'],
      '--dsw-alias-label-primary-bluish': ['#1C1B18', '#F2EFE9'],
      '--dsw-alias-label-shimmer': ['rgba(0, 0, 0, 0.3)', 'rgba(255, 255, 255, 0.45)'],
      '--dsw-alias-menu-icon': ['#5F5A51', '#D9D4CA'],

      '--dsw-alias-border-l1': ['rgba(28, 27, 24, 0.07)', 'rgba(255, 255, 255, 0.07)'],
      '--dsw-alias-border-l2': ['rgba(28, 27, 24, 0.1)', 'rgba(255, 255, 255, 0.11)'],
      '--dsw-alias-border-l2-darkmode-thin': ['rgba(28, 27, 24, 0.1)', 'rgba(255, 255, 255, 0.09)'],
      '--dsw-alias-border-l3': ['rgba(28, 27, 24, 0.14)', 'rgba(255, 255, 255, 0.16)'],
      '--dsw-alias-border-l4': ['rgba(28, 27, 24, 0.18)', 'rgba(255, 255, 255, 0.2)'],

      '--dsw-alias-card-fill': ['#FFFFFF', '#141416'],
      '--dsw-alias-card-fill-hover': ['#F7F4ED', '#1C1C20'],
      '--dsw-alias-card-tile-fill': ['rgba(28, 27, 24, 0.03)', 'rgba(255, 255, 255, 0.05)'],
      '--dsw-alias-interactive-bg-hover': ['rgba(28, 27, 24, 0.05)', 'rgba(255, 255, 255, 0.06)'],
      '--dsw-alias-interactive-bg-active': ['rgba(28, 27, 24, 0.09)', 'rgba(255, 255, 255, 0.12)'],
      '--dsw-alias-interactive-bg-hover-solid': ['#F4F1EA', '#202024'],
      '--dsw-alias-interactive-bg-hover-accent': ['rgba(28, 27, 24, 0.1)', 'rgba(255, 255, 255, 0.18)'],
      '--dsw-alias-interactive-bg-hover-danger': ['rgba(192, 67, 60, 0.07)', 'rgba(217, 115, 108, 0.15)'],

      '--dsw-alias-button-elevated-fill': ['#FFFFFF', '#26262B'],
      '--dsw-alias-button-floating-fill': ['#FFFFFF', '#202024'],
      '--dsw-alias-button-floating-hover': ['#F7F4ED', '#28282D'],
      '--dsw-alias-button-ghost-active-fill': ['#F1EDE4', '#26262B'],
      '--dsw-alias-button-ghost-active-hover': ['#EAE5DA', '#2C2C32'],
      '--dsw-alias-button-ghost-active-border': ['#A8A196', '#4A4A50'],
      '--dsw-alias-button-primary-dimmed': ['#F1EDE4', '#3A3A40'],
      '--dsw-alias-button-contrast-fill': ['#5F5A51', '#D9D4CA'],

      '--dsw-specific-sidebar-fill': ['#F5F2EB', '#16161A'],
      '--dsw-specific-sidebar-nav-item-active': ['#EDE8DD', '#1E1E22'],
      '--dsw-specific-sidebar-nav-item-active-accent': ['#E3DCCB', '#28282D'],

      '--dsw-menu-surface-fill': ['rgba(250, 248, 243, 0.74)', 'rgba(24, 24, 27, 0.72)'],
      '--dsw-alias-menu-group-header-fill': ['rgba(247, 244, 237, 0.94)', 'rgba(28, 28, 32, 0.94)'],
      '--dsw-specific-menu': ['rgba(250, 248, 243, 0.74)', 'rgba(24, 24, 27, 0.72)'],
      '--dsw-alias-toast-bg': ['#26262B', '#26262B'],
      '--dsw-alias-tooltip-bg': ['#26262B', '#26262B'],
      '--dsw-alias-hovercard-bg': ['#26262B', '#202024'],

      '--dsw-specific-input-major': ['#FFFFFF', '#18181B'],
      '--dsw-specific-selector': ['#F1EDE4', '#26262B'],
      '--dsw-specific-tip': ['#F1EDE4', '#232327'],
      '--dsw-specific-guide-hero': ['#E5DFD2', '#232327'],
      '--dsw-specific-bubble': ['#F0E9D9', '#1E1E20'],
      '--dsw-specific-bubble-highlight': ['#E4DBC5', '#2A2A2E'],

      '--dsw-alias-markdown-code-block': ['#F4F1EA', '#131315'],
      '--dsw-alias-markdown-code-block-banner': ['#F1EDE4', '#18181B'],
      '--dsw-alias-markdown-inline-code': ['#F1EDE4', '#1E1E22'],
      '--dsw-alias-markdown-tag': ['#F1EDE4', '#1E1E22'],
      '--dsw-alias-markdown-code-segment-selected': ['#FFFFFF', '#26262B'],
      '--dsw-alias-markdown-code-segment-unselected': ['#F1EDE4', '#18181B'],
      '--dsw-alias-markdown-citation': ['#F1EDE4', '#1E1E22'],
      '--dsw-alias-markdown-placeholder': ['#EDE9E0', '#26262B'],
      '--dsw-alias-turn-trigger-bg': ['#F4F1EA', '#16161A'],
      '--dsw-alias-turn-trigger-bg-hover': ['rgba(28, 27, 24, 0.05)', 'rgba(255, 255, 255, 0.08)'],

      '--dsw-alias-state-success-primary': ['#4F8A55', '#7FB069'],
      '--dsw-alias-state-success-secondary': ['#6FA972', '#9BC98A'],
      '--dsw-alias-state-success-tertiary': ['#E3F0E2', '#1F2A20'],
      '--dsw-alias-state-warn-primary': ['#B98332', '#D9A05B'],
      '--dsw-alias-state-warn-secondary': ['#D6A354', '#E8B97C'],
      '--dsw-alias-state-warn-tertiary': ['#F7EBD8', '#2A2318'],
      '--dsw-alias-state-warn-label': ['#96691F', '#D9A05B'],
      '--dsw-alias-state-error-primary': ['#C0433C', '#D9736C'],
      '--dsw-alias-state-error-secondary': ['#D9736C', '#E08C86'],
      '--dsw-alias-state-idle-primary': ['#C9C2B4', '#4A4A50'],
      '--dsw-alias-state-done-primary': ['#7C5BB5', '#B79CD9'],

      '--dsw-alias-scrollbar-bg-l1': ['#DCD5C7', '#2A2A30'],
      '--dsw-alias-scrollbar-bg-l2': ['#D2CBBB', '#33333A'],
      '--dsw-alias-scrollbar-hover-l1': ['#C6BFAE', '#3A3A42'],
      '--dsw-alias-scrollbar-hover-l2': ['#B9B2A0', '#454550'],

      '--dsw-alias-switch-thumb': ['#FFFFFF', '#A19C93'],
    };

    /**
     * Surface offsets in lightness points relative to the canvas, scaled by the
     * separation slider. The numbers reproduce the hand-set palette at 2.8.
     */
    const SURFACE_OFFSETS = {
      '--dsw-alias-bg-document-preview': 1.5,
      '--dsw-alias-bg-layer-1': 5.1,
      '--dsw-alias-bg-layer-2': 7.4,
      '--dsw-alias-bg-layer-3': 10.8,
      '--dsw-alias-bg-overlay': 7.4,
      '--dsw-alias-bg-module-platform': 8.4,
      '--dsw-alias-bg-multi-select': 4.4,
      '--dsw-alias-card-fill': 2.4,
      '--dsw-alias-card-fill-hover': 4.6,
      '--dsw-specific-sidebar-fill': 3.5,
      '--dsw-specific-sidebar-nav-item-active': 5.6,
      '--dsw-specific-sidebar-nav-item-active-accent': 7.6,
      '--dsw-alias-markdown-code-block': 1.9,
      '--dsw-alias-markdown-code-block-banner': 4.4,
      '--dsw-alias-markdown-inline-code': 5.4,
      '--dsw-alias-markdown-tag': 5.4,
      '--dsw-alias-markdown-code-segment-selected': 8,
      '--dsw-alias-markdown-code-segment-unselected': 4.4,
      '--dsw-alias-markdown-citation': 5.4,
      '--dsw-alias-markdown-placeholder': 8,
      '--dsw-specific-input-major': 5.1,
      '--dsw-specific-selector': 8,
      '--dsw-specific-tip': 8.4,
      '--dsw-specific-guide-hero': 8.4,
      '--dsw-specific-bubble': 6.3,
      '--dsw-specific-bubble-highlight': 9,
      '--dsw-alias-interactive-bg-hover-solid': 7.4,
      '--dsw-alias-button-elevated-fill': 8.4,
      '--dsw-alias-button-floating-fill': 7.4,
      '--dsw-alias-button-floating-hover': 8.8,
      '--dsw-alias-button-ghost-active-fill': 8.4,
      '--dsw-alias-button-ghost-active-hover': 9.6,
      '--dsw-alias-button-primary-dimmed': 10,
      '--dsw-alias-hovercard-bg': 7.4,
      '--dsw-alias-toast-bg': 9,
      '--dsw-alias-tooltip-bg': 9,
      '--dsw-alias-turn-trigger-bg': 2.4,
    };

    /** The dark ramp derived from the four sliders. */
    function darkSurfaces(tuning) {
      const scale = tuning.contrast / TUNING_DEFAULT.contrast;
      const derived = {};
      for (const token of Object.keys(SURFACE_OFFSETS)) {
        derived[token] = hslToHex(240, 6, tuning.depth + SURFACE_OFFSETS[token] * scale);
      }
      derived['--dsw-alias-bg-base'] = hslToHex(240, 6, tuning.depth);
      return derived;
    }

    /** The dark hairlines, derived from one alpha and the shipped ratios. */
    function darkHairlines(tuning) {
      const a = tuning.hairline;
      const alpha = (ratio) => 'rgba(255, 255, 255, ' + Math.min(0.5, (a * ratio) / 100).toFixed(3) + ')';
      return {
        '--dsw-alias-border-l1': alpha(1),
        '--dsw-alias-border-l2': alpha(1.57),
        '--dsw-alias-border-l2-darkmode-thin': alpha(1.28),
        '--dsw-alias-border-l3': alpha(2.29),
        '--dsw-alias-border-l4': alpha(2.86),
      };
    }

    /**
     * Ink ramp for the dark palette, derived from one lightness. Primary,
     * secondary and tertiary move together so the hierarchy keeps its gaps when
     * the primary is lowered; the shipped steps are 93 / 60 / 53.
     */
    function darkInk(tuning, accentId) {
      const l = tuning.textL;
      const key = Object.prototype.hasOwnProperty.call(ACCENTS, accentId) ? accentId : 'gold';
      const hue = ACCENTS[key].h;
      const secondary = Math.max(40, l - 25);
      const tertiary = Math.max(32, l - 30);
      return {
        '--dsw-alias-label-primary': hslToHex(0, 0, l),
        '--dsw-alias-label-primary-bluish': hslToHex(0, 0, l),
        '--dsw-alias-label-secondary': hslToHex(0, 0, secondary),
        '--dsw-alias-label-tertiary': hslToHex(0, 0, tertiary),
        '--dsw-alias-label-caption': hslToHex(0, 0, tertiary),
        '--dsw-alias-label-primary-dimmed': hslToHex(0, 0, Math.min(88, l - 11)),
        '--dsw-alias-menu-icon': hslToHex(0, 0, secondary),
      };
    }

    /**
     * Light-palette surfaces, tinted with the active accent.
     *
     * The hue comes from the selected accent family so the paper carries the
     * same colour as the links and focus ring; saturation stays around 10% so it
     * reads as a tint rather than a wash, and panels sit at a lower tint than the
     * canvas so they still feel like they lift off it.
     */
    function lightSurfaces(tuning, accentId) {
      const l = tuning.lightL;
      const key = Object.prototype.hasOwnProperty.call(ACCENTS, accentId) ? accentId : 'gold';
      const hue = ACCENTS[key].h;
      const at = (offset, sat) => hslToHex(hue, sat, l + offset);
      return {
        '--dsw-alias-bg-base': at(0, 10),
        // Surfaces stop being pure white: they sit a few points above the canvas,
        // so a large panel never glares even when the paper is pulled down.
        '--dsw-alias-bg-layer-1': at(2, 6),
        '--dsw-alias-card-fill': at(2, 6),
        '--dsw-specific-input-major': at(2, 6),
        '--dsw-alias-button-elevated-fill': at(3, 6),
        '--dsw-alias-button-floating-fill': at(3, 6),
        '--dsw-alias-button-floating-hover': at(1, 7),
        '--dsw-alias-bg-layer-2': at(-2.5, 10),
        '--dsw-alias-bg-layer-3': at(-5, 9),
        '--dsw-alias-bg-overlay': at(-2.5, 10),
        '--dsw-alias-bg-module-platform': at(-3.5, 10),
        '--dsw-alias-bg-multi-select': at(-2.5, 10),
        '--dsw-alias-bg-document-preview': at(-1, 9),
        '--dsw-alias-card-fill-hover': at(-1.5, 8),
        '--dsw-specific-sidebar-fill': at(-1.5, 9),
        '--dsw-specific-sidebar-nav-item-active': at(-3.5, 11),
        '--dsw-specific-sidebar-nav-item-active-accent': at(-6, 12),
        '--dsw-alias-markdown-code-block': at(-2.5, 10),
        '--dsw-alias-markdown-code-block-banner': at(-3.5, 10),
        '--dsw-alias-markdown-inline-code': at(-4, 10),
        '--dsw-alias-markdown-tag': at(-4, 10),
        '--dsw-alias-markdown-code-segment-unselected': at(-4, 10),
        '--dsw-alias-markdown-placeholder': at(-5, 10),
        '--dsw-alias-markdown-citation': at(-4, 10),
        '--dsw-alias-turn-trigger-bg': at(-2.5, 10),
        '--dsw-specific-selector': at(-4, 10),
        '--dsw-specific-tip': at(-4, 10),
        '--dsw-specific-guide-hero': at(-8, 10),
        // The bubble stays near-neutral: a second strong tint here fights the
        // accent instead of echoing it.
        '--dsw-specific-bubble': at(-5, 16),
        '--dsw-specific-bubble-highlight': at(-8, 16),
        '--dsw-alias-interactive-bg-hover-solid': at(-2.5, 10),
        '--dsw-alias-button-ghost-active-fill': at(-3.5, 10),
        '--dsw-alias-button-primary-dimmed': at(-3.5, 10),
      };
    }

    /**
     * Light-palette ink, carried to the accent hue.
     *
     * The ink used to be a fixed warm grey (hue 40). Against a cool canvas that
     * reads as yellow text, so the hue follows the accent at 6% saturation: the
     * text stays effectively neutral but stops fighting the paper.
     */
    function lightInk(accentId) {
      const key = Object.prototype.hasOwnProperty.call(ACCENTS, accentId) ? accentId : 'gold';
      const hue = ACCENTS[key].h;
      return {
        '--dsw-alias-label-primary': hslToHex(0, 0, 10.5),
        '--dsw-alias-label-primary-bluish': hslToHex(0, 0, 10.5),
        '--dsw-alias-label-secondary': hslToHex(0, 0, 36),
        '--dsw-alias-label-tertiary': hslToHex(0, 0, 48.5),
        '--dsw-alias-label-caption': hslToHex(0, 0, 48.5),
        '--dsw-alias-label-primary-dimmed': hslToHex(0, 0, 24),
        '--dsw-alias-menu-icon': hslToHex(0, 0, 34.5),
      };
    }

    /** Resolve one accent family at the current lightness offset. */
    function accentColors(id, accentL) {
      const accent = ACCENTS[id] || ACCENTS.gold;
      const baseL = typeof accent.darkL === 'number' ? accent.darkL : 60;
      const darkL = Math.min(84, Math.max(40, baseL + (accentL - 60)));
      return {
        light: hslToHex(accent.h, accent.lightS, accent.lightL),
        lightHover: hslToHex(accent.h, accent.lightS, accent.lightL - 6),
        lightSoft: hslToRgba(accent.h, accent.lightS, accent.lightL, 0.12),
        dark: hslToHex(accent.h, accent.s, darkL),
        darkHover: hslToHex(accent.h, accent.s, Math.min(84, darkL + 8)),
        darkSoft: hslToRgba(accent.h, accent.s, darkL, 0.16),
      };
    }

    /**
     * Emphasis family: one entry per token, each mapping to the accent's
     * light/dark value, so a single choice retints focus, links, selection and
     * trajectory together.
     */
    const ACCENTED = {
      '--dsw-alias-state-business-primary': (a) => [a.light, a.dark],
      '--dsw-alias-state-business-tertiary': (a) => [a.lightSoft, a.darkSoft],
      '--dsw-alias-label-deep-diving': (a) => [a.light, a.dark],
      '--dsw-alias-label-deep-diving-shimmer': (a) => [a.lightSoft, a.darkSoft],
      '--dsw-alias-link': (a) => [a.light, a.dark],
      '--dsw-alias-button-info-fill': (a) => [a.light, a.dark],
      '--dsw-alias-button-info-hover': (a) => [a.lightHover, a.darkHover],
      '--dsw-alias-border-selected': (a) => [a.light, a.dark],
      '--dsw-alias-trajectory-accent': (a) => [a.light, a.dark],
      '--dsw-specific-sidebar-right-flash': (a) => [a.light, a.dark],
    };

    /**
     * Compose the override map `overrideTokens` expects: ONE ENTRY PER TOKEN,
     * each carrying both palettes (`Record<token, { light, dark }>`). Reversing
     * that shape — `{ light: {…}, dark: {…} }` — fails the service's runtime
     * validation, so the layer silently never applies.
     */
    function buildTokens(accentId, tuning) {
      const accent = accentColors(accentId, tuning.accentL);
      const tokens = {};

      for (const token of Object.keys(BASE)) {
        tokens[token] = { light: BASE[token][0], dark: BASE[token][1] };
      }

      const surfaces = darkSurfaces(tuning);
      for (const token of Object.keys(surfaces)) {
        if (!tokens[token]) tokens[token] = { light: '#FFFFFF', dark: surfaces[token] };
        tokens[token].dark = surfaces[token];
      }

      const hairlines = darkHairlines(tuning);
      for (const token of Object.keys(hairlines)) {
        if (!tokens[token]) tokens[token] = { light: 'rgba(0, 0, 0, 0.08)', dark: hairlines[token] };
        tokens[token].dark = hairlines[token];
      }

      const lightSurf = lightSurfaces(tuning, accentId);
      for (const token of Object.keys(lightSurf)) {
        if (!tokens[token]) tokens[token] = { light: lightSurf[token], dark: '#18181B' };
        tokens[token].light = lightSurf[token];
      }

      const lightInkTokens = lightInk(accentId);
      for (const token of Object.keys(lightInkTokens)) {
        if (!tokens[token]) tokens[token] = { light: lightInkTokens[token], dark: '#F2EFE9' };
        tokens[token].light = lightInkTokens[token];
      }

      const ink = darkInk(tuning, accentId);
      for (const token of Object.keys(ink)) {
        if (!tokens[token]) tokens[token] = { light: '#1C1B18', dark: ink[token] };
        tokens[token].dark = ink[token];
      }

      // The user bubble carries the accent in both palettes.
      const accentFamily = ACCENTS[Object.prototype.hasOwnProperty.call(ACCENTS, accentId) ? accentId : 'gold'];
      tokens['--dsw-specific-bubble'] = { light: tokens['--dsw-specific-bubble'].light, dark: hslToHex(accentFamily.h, 16, 18) };
      tokens['--dsw-specific-bubble-highlight'] = { light: tokens['--dsw-specific-bubble-highlight'].light, dark: hslToHex(accentFamily.h, 16, 22) };

      for (const token of Object.keys(ACCENTED)) {
        const pair = ACCENTED[token](accent);
        tokens[token] = { light: pair[0], dark: pair[1] };
      }

      return tokens;
    }

    /** Read one persisted value, falling back when storage is unavailable. */
    function read(key, fallback) {
      try {
        const saved = window.localStorage.getItem(key);
        return typeof saved === 'string' && saved.length > 0 ? saved : fallback;
      } catch {
        return fallback;
      }
    }

    /** Persist one value, tolerating private mode and a full quota. */
    function write(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* the live layer still applies */
      }
    }

    /** Normalize a stored accent id against the known families. */
    function normalizeAccent(id) {
      return Object.prototype.hasOwnProperty.call(ACCENTS, id) ? id : 'gold';
    }

    /** Normalize a stored typography preset id. */
    function normalizeType(id) {
      return TYPE_ORDER.indexOf(id) >= 0 ? id : 'off';
    }

    /** Normalize a stored bold-colour preset id. */
    function normalizeStrong(id) {
      return STRONG_ORDER.indexOf(id) >= 0 ? id : 'off';
    }

    /** Normalize a stored content-block preset id. */
    function normalizeBlock(id, order) {
      return order.indexOf(id) >= 0 ? id : 'plain';
    }

    /** Publish the content-block preset on ody; plain removes it. */
    function applyBlock(inlineId, fenceId, tableId, olId, ulId, quoteId) {
      if (typeof document === 'undefined') return;
      const body = document.body;
      if (!body) return;
      body.setAttribute('data-noir-inline', normalizeBlock(inlineId, INLINE_ORDER));
      body.setAttribute('data-noir-fence', normalizeBlock(fenceId, FENCE_ORDER));
      body.setAttribute('data-noir-table', normalizeBlock(tableId, TABLE_ORDER));
      body.setAttribute('data-noir-ol', normalizeBlock(olId, OL_ORDER));
      body.setAttribute('data-noir-ul', normalizeBlock(ulId, UL_ORDER));
      body.setAttribute('data-noir-quote', normalizeBlock(quoteId, QUOTE_ORDER));
      paintFence();
    }

    /**
     * Draw the code-block frame as inline styles on the block container.
     *
     * The container is the element carrying `data-code-wrap`; it wraps both the
     * language bar (`_bannerWrap`) and the `pre` inside `_content`. `outline` is
     * useless here because Chromium draws it as a square rectangle that does not
     * follow `border-radius`, so the frame is a spread box-shadow instead. Inline
     * styles are the only reliable route: hashed class names change per build and
     * the banner wrapper is sticky.
     */
    function paintFence() {
      if (typeof document === 'undefined') return;
      const body = document.body;
      if (!body) return;
      const mode = body.getAttribute('data-noir-fence');
      const on = mode === 'outline' || mode === 'tight';
      const radius = mode === 'tight' ? '8px' : '10px';
      const blocks = document.querySelectorAll('[data-code-wrap]');
      for (const el of blocks) {
        if (!(el instanceof HTMLElement)) continue;
        // Earlier revisions stamped an outline; Chromium draws that as a square
        // rectangle that ignores the radius, so it must be cleared even when the
        // frame is on — otherwise two frames stack and the square one shows.
        if (el.style.outline !== '') {
          el.style.outline = '';
          el.style.outlineOffset = '';
        }
        if (on) {
          el.style.boxShadow = '0 0 0 1px var(--dsw-alias-border-l3)';
          el.style.borderRadius = radius;
        } else if (el.style.boxShadow !== '') {
          el.style.boxShadow = '';
          el.style.borderRadius = '';
        }
      }
    }

    /**
     * Resolve the bold colour for one preset: `null` for "inherit", otherwise a
     * light/dark pair.
     *
     * `accent` follows the accent family, darkened a step: the accent itself is
     * tuned for focus rings and thin marks, and as body text on graphite it reads
     * too bright. Both the applied colour and the chip swatches go through here,
     * so the swatch always shows what the text actually gets.
     */
    function strongPair(id, accentId, strongL) {
      if (id === 'off') return null;
      if (id === 'accent') {
        const key = Object.prototype.hasOwnProperty.call(ACCENTS, accentId) ? accentId : 'gold';
        const family = ACCENTS[key];
        return {
          light: hslToHex(family.h, family.lightS, family.lightL - 4),
          dark: hslToHex(family.h, Math.max(20, family.s - 6), strongL),
        };
      }
      return STRONG_PRESETS[id] || null;
    }

    /**
     * Publish the bold colour on `body`: one attribute plus the light/dark pair.
     * `off` removes both, so `strong` inherits the paragraph colour again.
     */
    function applyStrong(strongId, accentId, strongL) {
      if (typeof document === 'undefined') return;
      const body = document.body;
      if (!body) return;
      const pair = strongPair(normalizeStrong(strongId), accentId, strongL);
      if (pair === null) {
        body.removeAttribute('data-noir-strong');
        body.style.removeProperty('--noir-strong-light');
        body.style.removeProperty('--noir-strong-dark');
        return;
      }
      body.setAttribute('data-noir-strong', 'on');
      body.style.setProperty('--noir-strong-light', pair.light);
      body.style.setProperty('--noir-strong-dark', pair.dark);
    }

    /**
     * Publish the chosen typography preset on `body`: one attribute plus three
     * variables. Removing them restores the shipped transcript typography
     * exactly, so "off" leaves no residue.
     */
    function applyType(typeId) {
      if (typeof document === 'undefined') return;
      const body = document.body;
      if (!body) return;
      const id = normalizeType(typeId);
      const preset = TYPES[id];
      if (preset === null) {
        body.removeAttribute('data-noir-type');
        body.style.removeProperty('--noir-type-line');
        body.style.removeProperty('--noir-type-gap');
        body.style.removeProperty('--noir-type-width');
        return;
      }
      body.setAttribute('data-noir-type', id);
      body.style.setProperty('--noir-type-line', preset.line);
      body.style.setProperty('--noir-type-gap', preset.gap);
      body.style.setProperty('--noir-type-width', preset.width);
    }

    /** Clamp one tuning value into its slider range. */
    function clampTuning(name, value) {
      const range = TUNING_RANGE[name];
      const number = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(number)) return TUNING_DEFAULT[name];
      const clamped = Math.min(range.max, Math.max(range.min, number));
      return Math.round(clamped / range.step) * range.step;
    }

    /** Load the whole tuning object, filling in any missing key. */
    function loadTuning() {
      let saved = null;
      try {
        saved = JSON.parse(read(KEY_TUNING, '') || 'null');
      } catch {
        saved = null;
      }
      const tuning = {};
      for (const name of Object.keys(TUNING_DEFAULT)) {
        tuning[name] = saved && name in saved ? clampTuning(name, saved[name]) : TUNING_DEFAULT[name];
      }
      return tuning;
    }

    /**
     * Module-level preference, shared by the applied layer and both UI surfaces
     * so a drag repaints everything without a reload.
     */
    const listeners = new Set();
    const preference = {
      enabled: read(KEY_ENABLED, 'on') !== 'off',
      accent: normalizeAccent(read(KEY_ACCENT, 'gold')),
      tuning: loadTuning(),
      type: normalizeType(read(KEY_TYPE, 'off')),
      strong: normalizeStrong(read(KEY_STRONG, 'off')),
      inline: normalizeBlock(read(KEY_INLINE, 'plain'), INLINE_ORDER),
      fence: normalizeBlock(read(KEY_FENCE, 'plain'), FENCE_ORDER),
      table: normalizeBlock(read(KEY_TABLE, 'plain'), TABLE_ORDER),
      ol: normalizeBlock(read(KEY_OL, 'native'), OL_ORDER),
      ul: normalizeBlock(read(KEY_UL, 'native'), UL_ORDER),
      quote: normalizeBlock(read(KEY_QUOTE, 'plain'), QUOTE_ORDER),
    };

    /**
     * Last application failure. Kept module-level so the UI can show it: a token
     * layer that silently fails to stack looks exactly like a skin that is
     * working, which is the one failure mode not worth hiding.
     */
    let lastError = '';

    /** Set by `apply` so the Settings card can open the right-sidebar tab. */
    let openPanel = () => {};

    /** Subscribe to preference changes. */
    function subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }

    /** Apply one preference change and notify the layer and the UI. */
    function update(patch) {
      if (typeof patch.enabled === 'boolean') {
        preference.enabled = patch.enabled;
        write(KEY_ENABLED, patch.enabled ? 'on' : 'off');
      }
      if (typeof patch.accent === 'string') {
        preference.accent = normalizeAccent(patch.accent);
        write(KEY_ACCENT, preference.accent);
      }
      if (patch.tuning) {
        for (const name of Object.keys(patch.tuning)) {
          preference.tuning[name] = clampTuning(name, patch.tuning[name]);
        }
        write(KEY_TUNING, JSON.stringify(preference.tuning));
      }
      if (typeof patch.type === 'string') {
        preference.type = normalizeType(patch.type);
        write(KEY_TYPE, preference.type);
      }
      if (typeof patch.strong === 'string') {
        preference.strong = normalizeStrong(patch.strong);
        write(KEY_STRONG, preference.strong);
      }
      if (typeof patch.inline === 'string') {
        preference.inline = normalizeBlock(patch.inline, INLINE_ORDER);
        write(KEY_INLINE, preference.inline);
      }
      if (typeof patch.fence === 'string') {
        preference.fence = normalizeBlock(patch.fence, FENCE_ORDER);
        write(KEY_FENCE, preference.fence);
      }
      if (typeof patch.table === 'string') {
        preference.table = normalizeBlock(patch.table, TABLE_ORDER);
        write(KEY_TABLE, preference.table);
      }
      if (typeof patch.ol === 'string') {
        preference.ol = normalizeBlock(patch.ol, OL_ORDER);
        write(KEY_OL, preference.ol);
      }
      if (typeof patch.ul === 'string') {
        preference.ul = normalizeBlock(patch.ul, UL_ORDER);
        write(KEY_UL, preference.ul);
      }
      if (typeof patch.quote === 'string') {
        preference.quote = normalizeBlock(patch.quote, QUOTE_ORDER);
        write(KEY_QUOTE, preference.quote);
      }
      for (const listener of listeners) {
        try {
          listener();
        } catch {
          /* one broken subscriber must not stop the others */
        }
      }
    }

    const TEXT = {
      zh: {
        nav: '墨金外观',
        title: '墨金外观',
        lead: '近黑石墨底 + 香槟金，层级靠表面色深浅拉开，发丝线收细。',
        guideNote: '调画布深度、层次、金色和发丝线',
        accent: '强调色',
        gold: '香槟金',
        copper: '铜橙',
        teal: '冷青',
        ochre: '赭石',
        olive: '橄榄',
        sky: '天青',
        bamboo: '竹青',
        indigo: '靛青',
        autumn: '秋香色',
        gamboge: '藤黄',
        jade: '碧色',
        dai: '黛蓝',
        lotus: '青莲',
        amber: '琥珀',
        apricot: '杏黄',
        willow: '柳黄',
        incense: '香色',
        aubergine: '绛紫',
        tuning: '微调 · 仅深色',
        depth: '画布深度',
        contrast: '层次强度',
        accentL: '金色亮度',
        hairline: '发丝线',
        reset: '恢复默认',
        open: '在右侧栏打开',
        settingsNote: '开关在这里；调参页在右侧栏标签里（也可从右侧栏的「更多工具」里打开）。',
        enabled: '启用墨金外观',
        enabledNote: '关掉回到 DSH 内建配色',
        active: '已启用',
        muted: '已停用',
        failed: '没生效：',
        typeTitle: '会话排版',
        probe: '实测',
        typeNote: '与上面的配色开关互不影响。换一套后打开一段正式对话看效果，随时可以退回「不改」；DSH 升级后若失效会自动回到原排版。',
        typeOff: '不改',
        typeOffNote: 'DSH 默认',
        typeCompact: '紧凑',
        typeCompactNote: '行高 1.63 · 块距 16 · 列宽 748',
        typeReading: '阅读',
        typeReadingNote: '行高 1.75 · 块距 22 · 列宽 700',
        typeStructure: '结构',
        typeStructureNote: '行高 1.88 · 圆序号 · 引用卡片 · 斑马纹',
        typeDocument: '文档',
        typeDocumentNote: '行高 2.13 · 块距 40 · 列宽 600',
        strongTitle: '粗体颜色',
        strongNote: '给会话里的粗体上色。原来的「粗体着色」插件用同一段规则，两个同时开会互相抢，建议只留一个。',
        strongOff: '不染色',
        strongAccent: '跟随强调色',
        strongGold: '香槟金',
        strongL: '粗体亮度',
        textL: '文字亮度',
        lightL: '浅色亮度',
        blockTitle: '内容块',
        quoteTitle: '引用',
        quotePlain: '细线',
        quoteSoft: '淡底',
        quoteQuote: '引号',
        quoteBar: '金线',
        inlineTitle: '行内代码',
        inlinePlain: '素',
        inlineOutline: '描边',
        inlineAccent: '强调',
        fenceTitle: '代码块',
        fencePlain: '原样',
        fenceOutline: '描边',
        fenceTight: '紧凑',
        tableTitle: '表格',
        tablePlain: '横线',
        tableZebra: '斑马纹',
        tableHeader: '表头底色',
        olTitle: '有序列表',
        olNative: '数字',
        olAccent: '金色数字',
        olBadge: '圆徽标',
        ulTitle: '无序列表',
        ulNative: '圆点',
        ulAccent: '金色圆点',
        ulDash: '短横线',
        blockNote: '三个维度各自独立，可以任意混搭。',
        strongWarm: '暖橙',
      },
      en: {
        nav: 'Noir skin',
        title: 'Noir skin',
        lead: 'Graphite canvas with champagne ink: four surface steps, finer hairlines.',
        guideNote: 'Tune canvas depth, separation, accent and hairlines',
        accent: 'Accent',
        gold: 'Champagne',
        copper: 'Copper',
        teal: 'Teal',
        ochre: 'Ochre',
        olive: 'Olive',
        sky: 'Sky azure',
        bamboo: 'Bamboo',
        indigo: 'Indigo',
        autumn: 'Autumn gold',
        gamboge: 'Gamboge',
        jade: 'Jade',
        dai: 'Dai indigo',
        lotus: 'Lotus',
        amber: 'Amber',
        apricot: 'Apricot',
        willow: 'Willow yellow',
        incense: 'Incense',
        aubergine: 'Aubergine',
        tuning: 'Tuning (dark only)',
        depth: 'Canvas depth',
        contrast: 'Surface separation',
        accentL: 'Accent lightness',
        hairline: 'Hairline weight',
        reset: 'Reset',
        open: 'Open in right sidebar',
        settingsNote: 'The switch lives here; the tuning page is a right-sidebar tab (also reachable from the guide).',
        enabled: 'Enable noir skin',
        enabledNote: 'Turning it off restores the shipped DSH palette with no residue.',
        active: 'On',
        muted: 'Off',
        failed: 'Not applied: ',
        typeTitle: 'Transcript type',
        probe: 'Measured',
        typeNote: 'Independent of the palette switch above. Pick one, then open a real conversation to judge it; a DSH upgrade that changes the module class names falls back to the shipped typography automatically.',
        typeOff: 'Shipped',
        typeOffNote: 'DSH default',
        typeCompact: 'Compact',
        typeCompactNote: '1.63 line height · 16 gap · 748 column',
        typeReading: 'Reading',
        typeReadingNote: '1.75 line height · 22 gap · 700 column',
        typeStructure: 'Structure',
        typeStructureNote: '1.88 line height · numbered badges · quote card · zebra',
        typeDocument: 'Document',
        typeDocumentNote: '2.13 line height · 40 gap · 600 column',
        strongTitle: 'Bold colour',
        strongNote: 'Colours **bold** text in the transcript. The standalone bold-colour plugin targets the same rule — run one of the two, not both.',
        strongOff: 'Inherit',
        strongAccent: 'Follow accent',
        strongGold: 'Champagne',
        strongL: 'Bold brightness',
        textL: 'Text brightness',
        lightL: 'Light canvas',
        blockTitle: 'Content blocks',
        quoteTitle: 'Quote',
        quotePlain: 'Hairline',
        quoteSoft: 'Soft fill',
        quoteQuote: 'Quotation',
        quoteBar: 'Accent bar',
        inlineTitle: 'Inline code',
        inlinePlain: 'Plain',
        inlineOutline: 'Outline',
        inlineAccent: 'Accent',
        fenceTitle: 'Code block',
        fencePlain: 'Shipped',
        fenceOutline: 'Outline',
        fenceTight: 'Tight',
        tableTitle: 'Table',
        tablePlain: 'Rules',
        tableZebra: 'Zebra',
        tableHeader: 'Header fill',
        olTitle: 'Ordered list',
        olNative: 'Numbers',
        olAccent: 'Accent numbers',
        olBadge: 'Badges',
        ulTitle: 'Bullet list',
        ulNative: 'Dots',
        ulAccent: 'Accent dots',
        ulDash: 'Dashes',
        blockNote: 'Three independent axes; mix them freely.',
        strongWarm: 'Warm amber',
      },
    };

    /** Pick the copy for the browser language. */
    const copy = (function () {
      const lang = (typeof navigator !== 'undefined' && navigator.language) || 'en';
      return lang.toLowerCase().indexOf('zh') === 0 ? TEXT.zh : TEXT.en;
    })();

    /** Swatch plates: graphite ground with the accent's own plate on top. */
    function swatchPlate(id, tuning) {
      const accent = accentColors(id, tuning.accentL);
      return (
        'linear-gradient(135deg, #121214 0%, #1E1E22 58%, ' +
        accent.dark +
        ' 58%, ' +
        accent.dark +
        ' 74%, #1E1E22 74%)'
      );
    }

    const CSS = [
      // Right-sidebar tab body.
      '.noir-panel{display:flex;flex-direction:column;gap:22px;padding:20px 16px 24px;height:100%;box-sizing:border-box;overflow:auto}',
      '.noir-panel__head{display:flex;flex-direction:column;gap:6px}',
      '.noir-panel__row{display:flex;align-items:center;gap:9px}',
      '.noir-panel__mark{width:11px;height:11px;border-radius:3px;background:var(--dsw-alias-state-business-primary);flex:0 0 auto}',
      '.noir-panel__title{margin:0;font-size:15px;line-height:22px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.noir-panel__lead{margin:0;font-size:12px;line-height:19px;color:var(--dsw-alias-label-secondary)}',

      // Groups: a label with a hairline running to the right edge.
      '.noir-group{display:flex;flex-direction:column;gap:12px}',
      '.noir-group__label{display:flex;align-items:center;gap:8px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.noir-group__label::after{content:"";flex:1;height:0;border-top:.5px solid var(--dsw-alias-border-l1)}',
      '.noir-group__label.is-toggle{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:0;border:0;background:transparent;font:inherit;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);text-align:left;cursor:pointer}',
      '.noir-group__label.is-toggle:hover{color:var(--dsw-alias-label-secondary)}',
      '.noir-group__label.is-toggle::after{content:none}',
      '.noir-group__chevron{margin-left:auto;flex:0 0 auto;font-size:13px;line-height:1;color:var(--dsw-alias-label-tertiary)}',

      // Accent swatches.
      '.noir-swatches{display:flex;flex-wrap:wrap;gap:8px}',
      '.noir-swatch{box-sizing:border-box;flex:1 1 72px;min-width:72px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;min-height:62px;padding:10px 6px;border-radius:10px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer;transition:border-color .15s ease,color .15s ease,background-color .15s ease}',
      '.noir-swatch:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.noir-swatch[aria-pressed="true"]{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-label-primary)}',
      '.noir-swatch__chip{width:16px;height:16px;border-radius:999px;box-shadow:0 0 0 .5px var(--dsw-alias-border-l4)}',

      // Sliders: the filled part of the track is the accent itself.
      '.noir-sliders{display:flex;flex-direction:column;gap:14px}',
      '.noir-slider{display:flex;flex-direction:column;gap:5px}',
      '.noir-slider__head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}',
      '.noir-slider.is-disabled{opacity:.45}',
      '.noir-slider__value{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
      '.noir-range{width:100%;height:44px;margin:0;background:transparent;-webkit-appearance:none;appearance:none;cursor:pointer}',
      '.noir-range::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(to right,var(--dsw-alias-state-business-primary) calc(var(--noir-fill,50) * 1%),var(--dsw-alias-border-l3) calc(var(--noir-fill,50) * 1%))}',
      '.noir-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;margin-top:-5px;border-radius:999px;border:0;background:var(--dsw-alias-label-primary);box-shadow:0 1px 3px rgba(0,0,0,.5)}',

      // Footer: switch plus reset.
      '.noir-foot{display:flex;flex-direction:column;gap:16px;padding-top:4px}',
      '.noir-divider{height:0;border-top:.5px solid var(--dsw-alias-border-l1)}',
      '.noir-row{display:flex;align-items:center;justify-content:space-between;gap:12px}',
      '.noir-row__text{display:flex;flex-direction:column;gap:2px}',
      '.noir-row__title{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}',
      '.noir-row__note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.noir-switch{position:relative;width:44px;height:44px;flex:0 0 auto;padding:0;border:0;background:transparent;cursor:pointer}',
      '.noir-switch::before{content:"";position:absolute;left:2px;top:10px;width:40px;height:24px;box-sizing:border-box;border-radius:999px;border:.5px solid var(--dsw-alias-border-l3);background:var(--dsw-alias-switch-thumb);transition:background-color .15s ease}',
      '.noir-switch[aria-checked="true"]::before{background:var(--dsw-alias-state-business-primary);border-color:transparent}',
      '.noir-switch__knob{position:absolute;top:13px;left:22px;width:18px;height:18px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 2px rgba(0,0,0,.4);transition:transform .15s cubic-bezier(.2,.8,.2,1)}',
      '.noir-switch[aria-checked="false"] .noir-switch__knob{transform:translateX(-18px)}',
      '.noir-link{align-self:flex-start;display:inline-flex;align-items:center;min-height:44px;padding:0 2px;border:0;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;line-height:18px;cursor:pointer;text-decoration:underline;text-underline-offset:3px}',
      '.noir-link:hover{color:var(--dsw-alias-label-secondary)}',
      '.noir-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}',

      // Settings section.
      '.noir-settings{display:flex;flex-direction:column;gap:12px;padding:4px 0 8px}',
      '.noir-settings__card{display:flex;flex-direction:column;gap:14px;padding:16px;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}',
      '.noir-settings__head{display:flex;flex-direction:column;gap:6px}',
      '.noir-settings__open{align-self:flex-start;min-height:32px;padding:6px 14px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;cursor:pointer}',
      '.noir-settings__open:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.noir-settings__note{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}',
      '.noir-settings__divider{height:0;border-top:.5px solid var(--dsw-alias-border-l1)}',
      '.noir-settings__groupTitle{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',

      // Transcript-type radios.
      '.noir-type-list{display:flex;flex-direction:column;gap:2px}',
      '.noir-type{display:flex;align-items:flex-start;gap:10px;min-height:44px;padding:8px 10px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;text-align:left;cursor:pointer}',
      '.noir-type:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.noir-type[aria-checked="true"]{background:var(--dsw-alias-state-business-tertiary)}',
      '.noir-type__dot{width:16px;height:16px;flex:0 0 auto;margin-top:2px;box-sizing:border-box;border-radius:999px;border:.5px solid var(--dsw-alias-border-l3)}',
      '.noir-type[aria-checked="true"] .noir-type__dot{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);box-shadow:inset 0 0 0 3px var(--dsw-alias-bg-layer-1)}',
      '.noir-type__text{display:flex;flex-direction:column;gap:1px;min-width:0}',
      '.noir-type__name{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}',
      '.noir-type__note{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',

      // Compact chips (right-sidebar panel).
      '.noir-strong-dot{width:12px;height:12px;flex:0 0 auto;border-radius:999px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.22)}',
      '.noir-probe{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;font-variant-numeric:tabular-nums}',
      '.noir-type-chips{display:flex;flex-wrap:wrap;gap:6px}',
      '.noir-type-chip{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:1 1 22%;min-width:62px;min-height:44px;padding:8px 6px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:18px;cursor:pointer;transition:border-color .15s ease,background-color .15s ease,color .15s ease}',
      '.noir-type-chip:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.noir-type-chip[aria-checked="true"]{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-label-primary)}',

      // ── Conversation typography presets ──────────────────────────────────
      // Everything here is gated on body[data-noir-type], so an inactive
      // preset costs nothing and removing the attribute restores the shipped
      // transcript typography. The scope is the stable
      // [data-slot="conversation.chat.node"] wrapper; only line height and the
      // block gap need the hash-prefixed `_root` / `_body` module classes.
      'body[data-noir-type]{--dsh-chat-user-width:min(var(--noir-type-width,748px),100%)}',
      'body[data-noir-type] [data-slot="conversation.chat.node"] [class*="_root"]{line-height:var(--noir-type-line,28px)!important}',
      'body[data-noir-type] [data-slot="conversation.chat.node"] [class*="_body"]{--dsh-assistant-block-gap:var(--noir-type-gap,22px)!important}',
      'body[data-noir-type] [data-slot="conversation.chat.node"] :is(p,li,dd,td,th,blockquote){line-height:var(--noir-type-line,28px)}',
      'body[data-noir-type] [data-slot="conversation.chat.node"] h1{font-size:26px;line-height:34px;font-weight:600;letter-spacing:-.015em}',
      'body[data-noir-type] [data-slot="conversation.chat.node"] h2{font-size:24px;line-height:32px;font-weight:600;letter-spacing:-.015em}',
      'body[data-noir-type] [data-slot="conversation.chat.node"] h3{font-size:17px;line-height:26px;font-weight:600}',
      'body[data-noir-type="structure"] [data-slot="conversation.chat.node"] h2,body[data-noir-type="document"] [data-slot="conversation.chat.node"] h2{padding-bottom:10px;border-bottom:.5px solid var(--dsw-alias-border-l1)}',
      'body[data-noir-type="document"] [data-slot="conversation.chat.node"] h2{font-size:26px;line-height:36px;padding-bottom:12px}',
      'body[data-noir-type] [data-slot="conversation.chat.node"] li+li{margin-top:6px}',
      'body[data-noir-type] [data-slot="conversation.chat.node"] table{font-size:14px}',

      // Bold text inside conversation Markdown, when a colour is chosen.
      'body[data-noir-strong="on"] [class*="_markdown_"] :is(strong,b){color:var(--noir-strong-light,inherit)}',
      'body[data-noir-strong="on"][data-ds-dark-theme] [class*="_markdown_"] :is(strong,b){color:var(--noir-strong-dark,inherit)}',

      // Content-block presets own the quote, code fence and table shapes — the
      // typography presets deliberately stay out of these, so the two
      // dimensions never fight and "plain" really means shipped.
      // Content-block styles, one axis each. The typography presets stay out of
      // these, so each axis stands alone and can be mixed freely.
      'body[data-noir-inline] [data-slot="conversation.chat.node"] code:not(pre code){background:var(--dsw-alias-bg-layer-2);border-radius:5px;padding:1.5px 6px}',
      'body[data-noir-inline="outline"] [data-slot="conversation.chat.node"] code:not(pre code){box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l3)}',
      'body[data-noir-inline="accent"] [data-slot="conversation.chat.node"] code:not(pre code){color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary)}',

      'body[data-noir-fence] [data-slot="conversation.chat.node"] pre{border-radius:10px;padding:14px 16px}',
      'body[data-noir-fence="outline"] [data-slot="conversation.chat.node"] pre{box-shadow:none}',
      
      'body[data-noir-fence="tight"] [data-slot="conversation.chat.node"] pre{border-radius:0;padding:11px 13px;box-shadow:none}',
      

      'body[data-noir-table] [data-slot="conversation.chat.node"] :is(th,td){padding:9px 12px}',
      'body[data-noir-table="zebra"] [data-slot="conversation.chat.node"] tbody tr:nth-child(even){background:rgba(255,255,255,.02)}',
      'body[data-noir-table="header"] [data-slot="conversation.chat.node"] thead th{background:var(--dsw-alias-bg-layer-2);border-bottom:.5px solid var(--dsw-alias-border-l2)}',

      // Quote block, one axis: hairline, accent bar, soft fill or a quotation mark.
      'body[data-noir-quote] [data-slot="conversation.chat.node"] blockquote{padding:0 0 0 14px;border-left:2px solid var(--dsw-alias-border-l2);border-radius:0;background:none;color:var(--dsw-alias-label-secondary)}',
      'body[data-noir-quote="bar"] [data-slot="conversation.chat.node"] blockquote{padding:0 0 0 14px;border-left:3px solid var(--dsw-alias-state-business-primary);border-radius:0;background:none}',
      'body[data-noir-quote="soft"] [data-slot="conversation.chat.node"] blockquote{padding:14px 16px;border-left:0;border-radius:10px;background:var(--dsw-alias-state-business-tertiary)}',
      // Inside a tinted quote the inline code cannot keep its own fill: the grey
      // chip clashes with the tint and the "accent" variant puts gold ink on a
      // gold ground. A lighter chip serves all variants there.
      'body[data-noir-quote="soft"] [data-slot="conversation.chat.node"] blockquote code:not(pre code){background:rgba(255,255,255,.12);box-shadow:none}',
      'body[data-noir-quote="quote"] [data-slot="conversation.chat.node"] blockquote{position:relative;padding:2px 0 2px 30px;border-left:0;border-radius:0;background:none}',
      'body[data-noir-quote="quote"] [data-slot="conversation.chat.node"] blockquote::before{content:"\\201C";position:absolute;left:2px;top:-2px;font-family:Georgia,"Times New Roman",serif;font-size:34px;line-height:1;color:var(--dsw-alias-state-business-primary);opacity:.5}',

      // Lists, one axis each: ordered markers and unordered bullets.
      'body[data-noir-ol] [data-slot="conversation.chat.node"] ol{list-style:decimal;padding-left:24px}',
      'body[data-noir-ol="accent"] [data-slot="conversation.chat.node"] ol>li::marker{color:var(--dsw-alias-state-business-primary)}',
      'body[data-noir-ol="badge"] [data-slot="conversation.chat.node"] ol{list-style:none;padding-left:0;counter-reset:noir-ol}',
      'body[data-noir-ol="badge"] [data-slot="conversation.chat.node"] ol ol{counter-reset:noir-ol}',
      'body[data-noir-ol="badge"] [data-slot="conversation.chat.node"] ol>li{position:relative;padding-left:30px;counter-increment:noir-ol}',
      'body[data-noir-ol="badge"] [data-slot="conversation.chat.node"] ol>li::before{content:counter(noir-ol);position:absolute;left:0;top:calc((var(--noir-type-line,28px) - 20px) / 2);width:20px;height:20px;display:flex;align-items:center;justify-content:center;border-radius:999px;font-size:11px;line-height:1;color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary)}',

      'body[data-noir-ul] [data-slot="conversation.chat.node"] ul{list-style:disc;padding-left:24px}',
      'body[data-noir-ul="accent"] [data-slot="conversation.chat.node"] ul>li::marker{color:var(--dsw-alias-state-business-primary)}',
      'body[data-noir-ul="dash"] [data-slot="conversation.chat.node"] ul{list-style:none;padding-left:0}',
      'body[data-noir-ul="dash"] [data-slot="conversation.chat.node"] ul>li{position:relative;padding-left:20px}',
      'body[data-noir-ul="dash"] [data-slot="conversation.chat.node"] ul>li::before{content:"";position:absolute;left:2px;top:.95em;width:7px;height:1.5px;border-radius:1px;background:var(--dsw-alias-label-tertiary)}',
      'body[data-noir-ul="dash"] [data-slot="conversation.chat.node"] ul ul>li::before{width:5px;height:5px;border-radius:999px;top:1.15em}',
    ].join('');

    /**
     * Inject the stylesheet, rewriting an older revision in place.
     *
     * Reusing the tag without rewriting it is what strands a hot-reloaded module
     * with the previous rule set while its components already speak the new class
     * names — the panel then renders completely unstyled, which looks like a
     * layout bug rather than a stale sheet.
     */
    function ensureStyle() {
      const selector = 'style[data-plugin-css="' + LAYER + '/section.css"]';
      const found = document.querySelector(selector);
      if (found) {
        if (found.textContent !== CSS) found.textContent = CSS;
        return found;
      }
      const tag = document.createElement('style');
      tag.setAttribute('data-plugin-css', LAYER + '/section.css');
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return tag;
    }

    /** A collapsible group: a header row that toggles its body, collapsed first. */
    function Collapsible({ title, children }) {
      const [open, setOpen] = useState(false);
      return h(
        'section',
        { className: 'noir-group' },
        h(
          'button',
          {
            type: 'button',
            className: 'noir-group__label is-toggle',
            'aria-expanded': open ? 'true' : 'false',
            onClick: () => setOpen(!open),
          },
          h('span', null, title),
          h('span', { className: 'noir-group__chevron' }, open ? '\u2212' : '+'),
        ),
        open ? children : null,
      );
    }

    /** One labelled range row; the filled track follows the value. */
    function sliderRow(id, label, value, suffix, onChange, disabled) {
      const range = TUNING_RANGE[id];
      const percent = Math.round(((value - range.min) / (range.max - range.min)) * 100);
      return h(
        'div',
        { className: 'noir-slider' + (disabled ? ' is-disabled' : '') },
        h(
          'div',
          { className: 'noir-slider__head' },
          h('span', { className: 'noir-slider__name' }, label),
          h('span', { className: 'noir-slider__value' }, value + suffix),
        ),
        h('input', {
          className: 'noir-range',
          type: 'range',
          min: range.min,
          max: range.max,
          step: range.step,
          value: value,
          disabled: disabled === true,
          style: { '--noir-fill': String(percent) },
          'aria-label': label,
          onChange: (event) => onChange(Number(event.target.value)),
        }),
      );
    }

    /** The three accent swatches. */
    function accentRow(accent, tuning) {
      const cell = (id) =>
        h(
          'button',
          {
            type: 'button',
            key: id,
            className: 'noir-swatch',
            'aria-pressed': accent === id ? 'true' : 'false',
            onClick: () => update({ accent: id }),
          },
          h('span', {
            className: 'noir-swatch__chip',
            style: { background: accentColors(id, tuning.accentL).dark },
          }),
          h('span', null, copy[id]),
        );
      return h('div', { className: 'noir-swatches' }, Object.keys(ACCENTS).map(cell));
    }

    /** The on/off switch with its two-line label. */
    function switchRow(enabled) {
      return h(
        'div',
        { className: 'noir-row' },
        h(
          'div',
          { className: 'noir-row__text' },
          h('span', { className: 'noir-row__title' }, copy.enabled),
          h('span', { className: 'noir-row__note' }, copy.enabledNote),
        ),
        h(
          'button',
          {
            type: 'button',
            role: 'switch',
            className: 'noir-switch',
            'aria-checked': enabled ? 'true' : 'false',
            'aria-label': copy.enabled,
            onClick: () => update({ enabled: !enabled }),
          },
          h('span', { className: 'noir-switch__knob' }),
        ),
      );
    }

    /** Shared snapshot reader for both surfaces. */
    function usePreference() {
      const [snapshot, setSnapshot] = useState({
        enabled: preference.enabled,
        accent: preference.accent,
        tuning: { ...preference.tuning },
        type: preference.type,
        strong: preference.strong,
        inline: preference.inline,
        fence: preference.fence,
        table: preference.table,
        ol: preference.ol,
        ul: preference.ul,
        quote: preference.quote,
      });
      useEffect(() => {
        ensureStyle();
        return subscribe(() => {
          setSnapshot({
            enabled: preference.enabled,
            accent: preference.accent,
            tuning: { ...preference.tuning },
            type: preference.type,
            strong: preference.strong,
            inline: preference.inline,
        fence: preference.fence,
        table: preference.table,
        ol: preference.ol,
        ul: preference.ul,
        quote: preference.quote,
          });
        });
      }, []);
      return snapshot;
    }

    /**
     * Read what the transcript actually renders: the line height and width of a
     * live assistant body. Shown in the panel so "the preset does nothing" can be
     * told apart from "the preset is too subtle" without guessing.
     */
    function useTypeProbe() {
      const [probe, setProbe] = useState('');
      useEffect(() => {
        const read = () => {
          // The first `_root` in a node is often a zero-width hidden reasoning
          // box; report the first one that actually occupies space.
          const nodes = document.querySelectorAll('[data-slot="conversation.chat.node"] [class*="_root"]');
          for (const node of nodes) {
            const width = Math.round(node.getBoundingClientRect().width);
            if (width > 0) {
              const style = window.getComputedStyle(node);
              setProbe(style.lineHeight + ' · ' + width + 'px');
              return;
            }
          }
          setProbe('—');
        };
        read();
        const timer = window.setInterval(read, 800);
        return () => window.clearInterval(timer);
      }, []);
      return probe;
    }

    /**
     * Report the DOM shape around a code block so a mismatched selector is
     * visible instead of guessed at.
     */
    function useFenceProbe() {
      const [info, setInfo] = useState('');
      useEffect(() => {
        const mark = (el) =>
          el ? el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ')[0].slice(0, 24) : '-';
        const read = () => {
          const attr = document.body.getAttribute('data-noir-fence') || '-';
          const blocks = document.querySelectorAll('[data-code-wrap]');
          const withBanner = document.querySelectorAll('[data-code-wrap] [data-code-block-banner]');
          const first = blocks[0];
          const style = first ? window.getComputedStyle(first) : null;
          let painted = 0;
          for (const el of blocks) {
            if (el instanceof HTMLElement && el.style.boxShadow !== '') painted += 1;
          }
          setInfo(
            'blocks:' + blocks.length +
              ' wBanner:' + withBanner.length +
              ' painted:' + painted +
              ' shadow:' + (style ? String(style.boxShadow).slice(0, 24) : '-') +
              ' fence:' + attr,
          );
        };
        read();
        const timer = window.setInterval(read, 900);
        return () => window.clearInterval(timer);
      }, []);
      return info;
    }

    /**
     * The right-sidebar tab body. Renders inside the dock pane, so it stays in
     * normal flow: no fixed positioning, no overlay, the conversation underneath
     * keeps scrolling and repainting as the sliders move.
     */
    function NoirPanel() {
      const state = usePreference();
      const probe = useTypeProbe();
      const fenceInfo = useFenceProbe();

      return h(
        'div',
        { className: 'noir-panel' },
        h(
          'header',
          { className: 'noir-panel__head' },
          h(
            'div',
            { className: 'noir-panel__row' },
            h('span', { className: 'noir-panel__mark' }),
            h('h1', { className: 'noir-panel__title' }, copy.title),
          ),
          h('p', { className: 'noir-panel__lead' }, copy.lead),
        ),
        h(
          'section',
          { className: 'noir-group' },
          h('div', { className: 'noir-group__label' }, copy.accent),
          accentRow(state.accent, state.tuning),
        ),
        h(
          'section',
          { className: 'noir-group' },
          h('div', { className: 'noir-group__label' }, copy.tuning),
          h(
            'div',
            { className: 'noir-sliders' },
            sliderRow('depth', copy.depth, state.tuning.depth.toFixed(1), '', (value) => update({ tuning: { depth: value } })),
            sliderRow('contrast', copy.contrast, state.tuning.contrast.toFixed(1), '×', (value) => update({ tuning: { contrast: value } })),
            sliderRow('accentL', copy.accentL, Math.round(state.tuning.accentL), '%', (value) => update({ tuning: { accentL: value } })),
            sliderRow('hairline', copy.hairline, state.tuning.hairline.toFixed(1), '%', (value) => update({ tuning: { hairline: value } })),
            sliderRow('textL', copy.textL, state.tuning.textL.toFixed(1), '', (value) => update({ tuning: { textL: value } })),
            sliderRow('lightL', copy.lightL, state.tuning.lightL.toFixed(1), '', (value) => update({ tuning: { lightL: value } })),
          ),
        ),
        h(
          Collapsible,
          { title: copy.typeTitle },
          typeChips(state.type),
          h('div', { className: 'noir-probe' }, copy.probe + ' ' + probe),
        ),
        h(
          Collapsible,
          { title: copy.strongTitle },
          strongChips(state.strong, state.accent, state.tuning),
          sliderRow('strongL', copy.strongL, state.tuning.strongL.toFixed(1), '', (value) => update({ tuning: { strongL: value } }), state.strong !== 'accent'),
        ),
        h(
          Collapsible,
          { title: copy.blockTitle },
          h('div', { className: 'noir-group__label' }, copy.quoteTitle),
          axisChips(QUOTE_ORDER, state.quote, 'quote', 'quote'),
          h('div', { className: 'noir-group__label' }, copy.inlineTitle),
          axisChips(INLINE_ORDER, state.inline, 'inline', 'inline'),
          h('div', { className: 'noir-group__label' }, copy.fenceTitle),
          axisChips(FENCE_ORDER, state.fence, 'fence', 'fence'),
          h('div', { className: 'noir-group__label' }, copy.tableTitle),
          axisChips(TABLE_ORDER, state.table, 'table', 'table'),
          h('div', { className: 'noir-group__label' }, copy.olTitle),
          axisChips(OL_ORDER, state.ol, 'ol', 'ol'),
          h('div', { className: 'noir-group__label' }, copy.ulTitle),
          axisChips(UL_ORDER, state.ul, 'ul', 'ul'),
          h(
            'div',
            { className: 'noir-probe' },
            state.inline + ' · ' + state.fence + ' · ' + state.table + '  |  ' +
              (typeof document !== 'undefined' && document.body
                ? [
                    document.body.getAttribute('data-noir-inline'),
                    document.body.getAttribute('data-noir-fence'),
                    document.body.getAttribute('data-noir-table'),
                  ].join(' · ')
                : '-'),
          h('div', { className: 'noir-probe' }, fenceInfo),
          ),
        ),
        h(
          'div',
          { className: 'noir-foot' },
          h('div', { className: 'noir-divider' }),
          switchRow(state.enabled),
          h(
            'button',
            {
              type: 'button',
              className: 'noir-link',
              onClick: () => update({ tuning: { ...TUNING_DEFAULT } }),
            },
            copy.reset,
          ),
        ),
        lastError ? h('div', { className: 'noir-error' }, copy.failed + lastError) : null,
      );
    }

    /** Bold-colour chips; each carries the colour it applies (except "inherit"). */
    function strongChips(current, accentId, tuning) {
      const chip = (id) => {
        const pair = strongPair(id, accentId, tuning.strongL);
        return h(
          'button',
          {
            type: 'button',
            key: id,
            className: 'noir-type-chip',
            role: 'radio',
            'aria-checked': current === id ? 'true' : 'false',
            onClick: () => update({ strong: id }),
          },
          pair ? h('span', { className: 'noir-strong-dot', style: { background: pair.dark } }) : null,
          h('span', null, copy['strong' + id.charAt(0).toUpperCase() + id.slice(1)]),
        );
      };
      return h(
        'div',
        { className: 'noir-type-chips', role: 'radiogroup', 'aria-label': copy.strongTitle },
        STRONG_ORDER.map(chip),
      );
    }

    /** Chips for one content-block axis; `key` is the preference it writes. */
    function axisChips(order, current, prefix, key) {
      const chip = (id) =>
        h(
          'button',
          {
            type: 'button',
            key: id,
            className: 'noir-type-chip',
            role: 'radio',
            'aria-checked': current === id ? 'true' : 'false',
            onClick: () => update({ [key]: id }),
          },
          h('span', null, copy[prefix + id.charAt(0).toUpperCase() + id.slice(1)]),
        );
      return h(
        'div',
        { className: 'noir-type-chips', role: 'radiogroup', 'aria-label': copy[prefix + 'Title'] },
        order.map(chip),
      );
    }

    /** Compact preset chips for the right-sidebar panel. */
    function typeChips(current) {
      const chip = (id) =>
        h(
          'button',
          {
            type: 'button',
            key: id,
            className: 'noir-type-chip',
            role: 'radio',
            'aria-checked': current === id ? 'true' : 'false',
            onClick: () => update({ type: id }),
          },
          copy['type' + id.charAt(0).toUpperCase() + id.slice(1)],
        );
      return h(
        'div',
        { className: 'noir-type-chips', role: 'radiogroup', 'aria-label': copy.typeTitle },
        TYPE_ORDER.map(chip),
      );
    }

    /** One radio row for a typography preset. */
    function typeOption(id, current) {
      const selected = current === id;
      return h(
        'button',
        {
          type: 'button',
          key: id,
          className: 'noir-type',
          role: 'radio',
          'aria-checked': selected ? 'true' : 'false',
          onClick: () => update({ type: id }),
        },
        h('span', { className: 'noir-type__dot' }),
        h(
          'span',
          { className: 'noir-type__text' },
          h('span', { className: 'noir-type__name' }, copy['type' + id.charAt(0).toUpperCase() + id.slice(1)]),
          h('span', { className: 'noir-type__note' }, copy['type' + id.charAt(0).toUpperCase() + id.slice(1) + 'Note']),
        ),
      );
    }

    /** Settings → Appearance → Noir skin: the switch, the transcript type, the tab. */
    function NoirSkinSection() {
      const state = usePreference();

      return h(
        'div',
        { className: 'noir-settings' },
        h(
          'div',
          { className: 'noir-settings__card' },
          h(
            'div',
            { className: 'noir-settings__head' },
            h(
              'div',
              { className: 'noir-panel__row' },
              h('span', { className: 'noir-panel__mark' }),
              h('div', { className: 'noir-panel__title' }, copy.title),
            ),
            h('div', { className: 'noir-panel__lead' }, copy.lead),
          ),
          switchRow(state.enabled),
          h('div', { className: 'noir-settings__divider' }),
          h('div', { className: 'noir-settings__groupTitle' }, copy.typeTitle),
          h(
            'div',
            { className: 'noir-type-list', role: 'radiogroup', 'aria-label': copy.typeTitle },
            TYPE_ORDER.map((id) => typeOption(id, state.type)),
          ),
          h('div', { className: 'noir-settings__note' }, copy.typeNote),
          h('div', { className: 'noir-settings__divider' }),
          h(
            'button',
            { type: 'button', className: 'noir-settings__open', onClick: () => openPanel() },
            copy.open,
          ),
          h('div', { className: 'noir-settings__note' }, copy.settingsNote),
        ),
        lastError ? h('div', { className: 'noir-error' }, copy.failed + lastError) : null,
      );
    }

    return {
      inject: ['theme', 'slots', 'sidebarRight', 'sidebarRightTabs'],
      apply(ctx) {
        let disposeLayer = null;
        let frame = 0;

        /** Re-stack the override layer from the current preference. */
        function paint() {
          if (typeof disposeLayer === 'function') {
            try {
              disposeLayer();
            } catch {
              /* a dispose after disposal is not an error */
            }
            disposeLayer = null;
          }
          if (!preference.enabled) {
            lastError = '';
            return;
          }
          try {
            disposeLayer = ctx.theme.overrideTokens(LAYER, buildTokens(preference.accent, preference.tuning));
            lastError = '';
          } catch (error) {
            lastError = (error && error.message) || String(error);
            console.error('[noir-skin] could not apply the token layer:', error);
          }
        }

        /**
         * Slider drags fire many times per second and each repaint restacks the
         * whole layer, so coalesce them into one paint per animation frame.
         */
        function schedulePaint() {
          if (frame !== 0) return;
          frame = requestAnimationFrame(() => {
            frame = 0;
            paint();
          });
        }

        const unsubscribe = subscribe(() => {
          schedulePaint();
          applyType(preference.type);
          applyStrong(preference.strong, preference.accent, preference.tuning.strongL);
          applyBlock(preference.inline, preference.fence, preference.table, preference.ol, preference.ul, preference.quote);
        });
        paint();
        applyType(preference.type);
        applyStrong(preference.strong, preference.accent, preference.tuning.strongL);
        applyBlock(preference.inline, preference.fence, preference.table, preference.ol, preference.ul, preference.quote);

        // Keep the code-block frames in sync as rows mount and unmount.
        ctx.effect(() => {
          if (typeof MutationObserver === 'undefined' || !document.body) return () => {};
          let scheduled = 0;
          const observer = new MutationObserver(() => {
            if (scheduled !== 0) return;
            scheduled = window.setTimeout(() => {
              scheduled = 0;
              paintFence();
            }, 200);
          });
          observer.observe(document.body, { childList: true, subtree: true });
          paintFence();
          return () => {
            if (scheduled !== 0) window.clearTimeout(scheduled);
            observer.disconnect();
          };
        }, 'noir-skin: fence frames');

        // Own the stylesheet for the plugin's lifetime: disposing removes the
        // element, so a reload starts from the current rules instead of adopting
        // whatever the previous module generation left behind.
        ctx.effect(() => {
          const tag = ensureStyle();
          return () => tag.remove();
        }, 'noir-skin: stylesheet');

        /** Open (or focus) the tuning tab in the right sidebar. */
        openPanel = () => {
          try {
            ctx.sidebarRight.openTab(KIND);
          } catch (error) {
            console.error('[noir-skin] could not open the right-sidebar tab:', error);
          }
        };

        // Stage 1: the tab type plus its guide card.
        ctx.effect(
          () =>
            ctx.sidebarRightTabs.register({
              id: TYPE_ID,
              kind: KIND,
              title: () => copy.nav,
              guide: [
                {
                  id: 'panel',
                  title: () => copy.nav,
                  description: () => copy.guideNote,
                  order: 30,
                },
              ],
            }),
          'noir-skin: tab type',
        );

        // Stage 2: the body, keyed by the type id.
        ctx.effect(
          () =>
            ctx.slots.inject('sidebar.right.pane.tab', () =>
              ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TYPE_ID }, NoirPanel),
            ),
          'noir-skin: tab body',
        );

        ctx.effect(
          () =>
            ctx.slots.inject('settings.section', () =>
              ctx.slots.register(
                {
                  name: 'settings.section',
                  id: 'noir-skin',
                  order: 5,
                  label: () => copy.nav,
                },
                NoirSkinSection,
              ),
            ),
          'noir-skin: settings section',
        );

        return () => {
          unsubscribe();
          if (frame !== 0) cancelAnimationFrame(frame);
          if (typeof disposeLayer === 'function') disposeLayer();
        };
      },
    };
  },
});