/** Rich HTML showcase fixtures — portable DOCX-oriented demos, excluded from the regression loop. */

export interface ShowcaseCase {
  name: string;
  title: string;
  description: string;
  category: string;
  /** Static body fragment (most showcases). */
  html?: string;
  /** Conversion style resolver — default inline. Use computed for stylesheet/class demos. */
  styleSource?: "inline" | "computed";
  /** Relative `<img src>` values resolve from `examples/{name}/` via imageResolver. */
  usesImageResolver?: boolean;
  /** Load a file:// React preview in Playwright and extract `reactRootId` innerHTML. */
  reactPreviewPath?: string;
  reactRootId?: string;
}

const SHOWCASE_CASES: ShowcaseCase[] = [
  {
    name: "quarterly-financials",
    title: "Q1 2026 Condensed Income Statement",
    category: "financial",
    description:
      "Multi-column financial table with subtotals, YoY deltas, shaded header row, and footnotes.",
    html: `
      <div style="font-family:Georgia,'Times New Roman',serif;color:#1c1917">
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#78716c">Audited · Form 10-Q excerpt</p>
        <h1 style="color:#14532d;margin:0 0 4px;font-size:26px;font-weight:normal">Meridian Analytics, Inc.</h1>
        <p style="color:#57534e;margin:0 0 16px;font-size:13px;border-bottom:2px solid #ca8a04;padding-bottom:8px">
          Condensed Income Statement · Quarter ended March 31, 2026 · (USD, thousands)
        </p>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
          <tr style="background:#14532d;color:#fef9c3">
            <td><strong>Line item</strong></td>
            <td style="text-align:right"><strong>Q1 2026</strong></td>
            <td style="text-align:right"><strong>Q1 2025</strong></td>
            <td style="text-align:right"><strong>YoY %</strong></td>
          </tr>
          <tr><td>Revenue</td><td style="text-align:right">$48,320</td><td style="text-align:right">$41,180</td><td style="text-align:right;color:#15803d">+17.3%</td></tr>
          <tr><td>Cost of revenue</td><td style="text-align:right">($14,896)</td><td style="text-align:right">($13,574)</td><td style="text-align:right">+9.7%</td></tr>
          <tr style="background:#ecfdf5"><td><strong>Gross profit</strong></td><td style="text-align:right"><strong>$33,424</strong></td><td style="text-align:right"><strong>$27,606</strong></td><td style="text-align:right"><strong>+21.1%</strong></td></tr>
          <tr><td>Sales &amp; marketing</td><td style="text-align:right">($9,664)</td><td style="text-align:right">($8,236)</td><td style="text-align:right">+17.3%</td></tr>
          <tr><td>Research &amp; development</td><td style="text-align:right">($7,248)</td><td style="text-align:right">($6,177)</td><td style="text-align:right">+17.3%</td></tr>
          <tr><td>General &amp; administrative</td><td style="text-align:right">($4,832)</td><td style="text-align:right">($4,118)</td><td style="text-align:right">+17.3%</td></tr>
          <tr style="background:#ecfdf5"><td><strong>Operating income</strong></td><td style="text-align:right"><strong>$11,680</strong></td><td style="text-align:right"><strong>$9,075</strong></td><td style="text-align:right"><strong>+28.7%</strong></td></tr>
          <tr><td>Interest &amp; other</td><td style="text-align:right">($412)</td><td style="text-align:right">($388)</td><td style="text-align:right">+6.2%</td></tr>
          <tr style="background:#fef9c3"><td><strong>Net income</strong></td><td style="text-align:right"><strong>$11,268</strong></td><td style="text-align:right"><strong>$8,687</strong></td><td style="text-align:right;color:#15803d"><strong>+29.7%</strong></td></tr>
        </table>
        <p style="font-size:11px;color:#78716c;margin-top:12px;font-style:italic">
          Non-GAAP adjustments excluded. Prepared by Finance · <a href="#" style="color:#14532d">full 10-Q draft</a>.
        </p>
      </div>
    `,
  },
  {
    name: "product-launch-brief",
    title: "Product Launch Brief — Atlas CRM 3.0",
    category: "work-product",
    description:
      "One-pager with hero banner, KPI table, funnel table, and roadmap list — styled via embedded CSS classes.",
    styleSource: "computed",
    html: `
      <style>
        .brief { font-family: "Trebuchet MS", Arial, sans-serif; }
        .hero {
          background: #1a1a2e;
          color: #fff;
          padding: 24px 28px;
          margin-bottom: 18px;
        }
        .hero-kicker {
          margin: 0;
          font-size: 11px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: #a8dadc;
        }
        .hero h1 {
          margin: 10px 0 6px;
          color: #fff;
          font-size: 32px;
          font-weight: bold;
        }
        .hero-date { margin: 0; color: #cbd5e1; font-size: 14px; }
        .callout {
          background: #f0f7ff;
          padding: 14px 18px;
          margin-bottom: 16px;
          border-left: 5px solid #457b9d;
        }
        .callout strong { color: #1d3557; }
        .callout span { color: #334155; }
        .section-label {
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #1d3557;
          margin-bottom: 8px;
        }
        .section-label strong { color: #1d3557; }
        table.kpi-table {
          border-collapse: collapse;
          width: 100%;
          background: #f8fafc;
        }
        table.kpi-table tr.header td {
          background: #1d3557;
          color: #fff;
          padding: 10px;
        }
        table.kpi-table td {
          padding: 10px;
          border-bottom: 1px solid #dbeafe;
        }
        table.kpi-table td.num { text-align: right; }
        h2.section {
          font-size: 14px;
          color: #1d3557;
          margin-top: 20px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        table.funnel {
          border-collapse: collapse;
          width: 100%;
          border-color: #cbd5e1;
        }
        table.funnel td { padding: 8px; border: 1px solid #cbd5e1; }
        table.funnel tr.header td { background: #e8eef5; }
        table.funnel td.num { text-align: right; }
        table.funnel tr.highlight td { background: #f0f7ff; }
        ul.roadmap { color: #44403c; }
        .badge {
          padding: 1px 6px;
          font-size: 11px;
        }
        .badge-shipped { background: #bbf7d0; color: #14532d; }
        .badge-building { background: #fde68a; color: #92400e; }
        .badge-planned { background: #e7e5e4; color: #57534e; }
        .footer { color: #1d3557; font-size: 13px; }
        .footer a { color: #457b9d; }
      </style>
      <div class="brief">
        <div class="hero">
          <p class="hero-kicker">Product launch</p>
          <h1>Atlas CRM 3.0</h1>
          <p class="hero-date">General availability · April 14</p>
        </div>
        <div class="callout">
          <strong>North star:</strong>
          <span> Cut time-to-first-deal by 40% for mid-market sales teams.</span>
        </div>
        <p class="section-label"><strong>Launch KPIs</strong> · target 90 days</p>
        <table class="kpi-table" border="0" cellpadding="10">
          <tr class="header">
            <td><strong>Metric</strong></td>
            <td class="num"><strong>Target</strong></td>
          </tr>
          <tr><td>Activations</td><td class="num">12,000</td></tr>
          <tr><td>Week-4 retention</td><td class="num">68%</td></tr>
          <tr><td>NPS</td><td class="num">4.6</td></tr>
        </table>
        <h2 class="section">Activation funnel</h2>
        <table class="funnel" border="1" cellpadding="8">
          <tr class="header">
            <td><strong>Stage</strong></td>
            <td class="num"><strong>Count</strong></td>
            <td class="num"><strong>Conversion</strong></td>
          </tr>
          <tr><td>Signup</td><td class="num">12,400</td><td class="num">100%</td></tr>
          <tr><td>Trial</td><td class="num">9,800</td><td class="num">79%</td></tr>
          <tr><td>Qualified</td><td class="num">6,200</td><td class="num">50%</td></tr>
          <tr class="highlight"><td><strong>Closed</strong></td><td class="num"><strong>3,100</strong></td><td class="num"><strong>25%</strong></td></tr>
        </table>
        <h2 class="section">Roadmap</h2>
        <ul class="roadmap">
          <li><span class="badge badge-shipped">SHIPPED</span> Pipeline AI summaries</li>
          <li><span class="badge badge-building">BUILDING</span> Mobile offline mode</li>
          <li><span class="badge badge-planned">PLANNED</span> Enterprise SSO &amp; audit log</li>
        </ul>
        <p class="footer">Owner: <strong>Jordan Lee</strong> · <a href="mailto:launch@example.com">launch@example.com</a></p>
      </div>
    `,
  },
  {
    name: "javascript-essay",
    title: "3 Reasons JavaScript Is Great",
    category: "essay",
    description:
      "Short essay with section headings, blockquote, inline highlights, and a numbered list.",
    html: `
      <div style="font-family:Georgia,'Times New Roman',serif;background:#fffbeb;padding:28px 32px;color:#292524">
        <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#c2410c">Opinion · Technology</p>
        <h1 style="font-size:30px;color:#1c1917;margin:0 0 8px;font-weight:normal;line-height:1.15">3 Reasons JavaScript Is Great</h1>
        <p style="color:#78716c;margin:0 0 20px;font-size:14px;font-style:italic;border-bottom:1px solid #fcd34d;padding-bottom:14px">
          A quick case for the language that runs half the web — and a lot beyond it.
        </p>
        <p style="font-size:15px;line-height:1.55">
          JavaScript started as a way to add behavior to web pages. Today it powers browsers, servers,
          mobile apps, and desktop tools. Here are three reasons it remains one of the most practical
          languages to learn and ship with.
        </p>
        <h2 style="font-size:20px;color:#c2410c;margin-top:24px;font-weight:normal">1. It runs everywhere</h2>
        <p style="font-size:15px;line-height:1.55">
          The same language works in the browser, on the server with <code style="font-family:Consolas,monospace;background:#fef3c7;padding:1px 4px">Node.js</code>, at the edge,
          and inside native shells like Electron. One team can share patterns, libraries,
          and even code between a React dashboard and its API.
        </p>
        <blockquote style="border-left:4px solid #c2410c;padding:12px 16px;margin:20px 0;background:#fef3c7;color:#44403c;font-style:italic">
          <p style="margin:0;font-size:15px">“Write once, run anywhere” is usually hype. For JavaScript, it is Tuesday.</p>
        </blockquote>
        <h2 style="font-size:20px;color:#c2410c;margin-top:24px;font-weight:normal">2. The ecosystem is enormous</h2>
        <p style="font-size:15px;line-height:1.55">
          <strong style="color:#9a3412">npm</strong> hosts millions of packages — charting libraries, test runners,
          full frameworks. Need routing, dates, or PDF generation? There is almost certainly a
          well-maintained module waiting for you.
        </p>
        <h2 style="font-size:20px;color:#c2410c;margin-top:24px;font-weight:normal">3. It meets you where you are</h2>
        <p style="font-size:15px;line-height:1.55">
          Start with a single script tag and DevTools. Later add types, bundlers, and frameworks — or stay
          minimal. Functions are first-class values, and <em>async/await</em> makes asynchronous code readable.
        </p>
        <p style="margin-top:24px;font-size:15px;line-height:1.55">
          <strong>Bottom line:</strong> ubiquity, tooling, and approachability make JavaScript equally at home
          in a weekend prototype and a production SaaS dashboard.
        </p>
        <p style="color:#a8a29e;font-size:12px;margin-top:20px;border-top:1px solid #fde68a;padding-top:12px">
          dom-docx essay showcase · July 2026
        </p>
      </div>
    `,
  },
  {
    name: "regional-sales-dashboard",
    title: "Regional Sales Dashboard — March",
    category: "charts",
    description:
      "Regional metrics table with conditional coloring and rep leaderboard — styled via embedded CSS classes.",
    styleSource: "computed",
    html: `
      <style>
        .dashboard { font-family: Arial, Helvetica, sans-serif; }
        .header {
          background: #115e59;
          color: #ccfbf1;
          padding: 16px 20px;
          margin-bottom: 14px;
        }
        .header h1 {
          margin: 0;
          font-size: 22px;
          color: #fff;
        }
        .header .subtitle {
          margin: 6px 0 0;
          font-size: 12px;
          color: #99f6e4;
        }
        .legend { font-size: 12px; margin-bottom: 12px; }
        .tag {
          padding: 2px 8px;
        }
        .tag-above {
          background: #d1fae5;
          color: #065f46;
        }
        .tag-below {
          background: #fce7f3;
          color: #9d174d;
          margin-left: 6px;
        }
        table.metrics {
          border-collapse: collapse;
          width: 100%;
          font-size: 13px;
        }
        table.metrics td {
          padding: 8px;
          border: 1px solid #ccc;
        }
        table.metrics tr.head {
          background: #581c87;
          color: #f3e8ff;
        }
        table.metrics td.num {
          text-align: right;
          font-family: Consolas, monospace;
        }
        table.metrics tr.alt { background: #f0fdfa; }
        table.metrics tr.total {
          background: #115e59;
          color: #fff;
        }
        .delta-up { color: #059669; }
        .delta-down { color: #db2777; }
        .pct-above { background: #d1fae5; color: #065f46; }
        .pct-below { background: #fce7f3; color: #9d174d; }
        h2.leaderboard {
          font-size: 13px;
          margin-top: 20px;
          color: #581c87;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        ol.leaderboard { font-size: 14px; }
        .mono { font-family: Consolas, monospace; }
        .quota-good { color: #059669; }
        .quota-warn { color: #d97706; }
      </style>
      <div class="dashboard">
        <div class="header">
          <h1>Regional Sales Dashboard</h1>
          <p class="subtitle">March · USD millions</p>
        </div>
        <p class="legend">
          <span class="tag tag-above">▲ Above plan</span>
          <span class="tag tag-below">▼ Below plan</span>
        </p>
        <table class="metrics" border="1" cellpadding="8">
          <tr class="head">
            <td><strong>Region</strong></td>
            <td class="num"><strong>Actual</strong></td>
            <td class="num"><strong>Plan</strong></td>
            <td class="num"><strong>Δ</strong></td>
            <td class="num"><strong>% plan</strong></td>
          </tr>
          <tr>
            <td>West</td>
            <td class="num">$2.41</td>
            <td class="num">$2.20</td>
            <td class="num delta-up">+9.5%</td>
            <td class="num"><span class="pct-above">110%</span></td>
          </tr>
          <tr class="alt">
            <td>East</td>
            <td class="num">$1.98</td>
            <td class="num">$2.05</td>
            <td class="num delta-down">-3.4%</td>
            <td class="num"><span class="pct-below">97%</span></td>
          </tr>
          <tr>
            <td>EMEA</td>
            <td class="num">$1.62</td>
            <td class="num">$1.50</td>
            <td class="num delta-up">+8.0%</td>
            <td class="num"><span class="pct-above">108%</span></td>
          </tr>
          <tr class="alt">
            <td>APAC</td>
            <td class="num">$1.15</td>
            <td class="num">$1.20</td>
            <td class="num delta-down">-4.2%</td>
            <td class="num"><span class="pct-below">96%</span></td>
          </tr>
          <tr class="total">
            <td><strong>Total</strong></td>
            <td class="num"><strong>$7.16</strong></td>
            <td class="num"><strong>$6.95</strong></td>
            <td class="num"><strong>+3.0%</strong></td>
            <td class="num"><strong>103%</strong></td>
          </tr>
        </table>
        <h2 class="leaderboard">Rep leaderboard</h2>
        <ol class="leaderboard">
          <li><strong>A. Chen</strong> — <span class="mono">$840k</span> <span class="quota-good">(128% quota)</span></li>
          <li><strong>M. Ortiz</strong> — <span class="mono">$790k</span> <span class="quota-good">(119% quota)</span></li>
          <li><strong>S. Patel</strong> — <span class="mono">$755k</span> <span class="quota-warn">(104% quota)</span></li>
        </ol>
      </div>
    `,
  },
  {
    name: "sprint-retrospective",
    title: "Sprint 24 Retrospective — Platform Team",
    category: "work-product",
    description:
      "Agile retro with action-item table, status badges, lists, and section dividers.",
    html: `
      <div style="font-family:'Trebuchet MS',Arial,sans-serif">
        <div style="background:#fef08a;padding:14px 18px;margin-bottom:16px;border:2px dashed #ca8a04">
          <h1 style="margin:0;font-size:22px;color:#713f12">📋 Sprint 24 Retrospective</h1>
          <p style="margin:6px 0 0;color:#854d0e;font-size:13px">Platform Team · Mar 3 – Mar 14 · Velocity: <strong>42 pts</strong></p>
        </div>
        <div style="background:#dcfce7;padding:12px 16px;margin-bottom:12px;border-left:5px solid #16a34a">
          <h2 style="font-size:14px;margin:0 0 8px;color:#14532d">✓ What went well</h2>
          <ul style="margin:0;padding-left:20px;color:#166534">
            <li>Reduced P95 API latency by <strong>18%</strong></li>
            <li>Zero sev-1 incidents during migration</li>
            <li>Pairing sessions improved onboarding scores</li>
          </ul>
        </div>
        <div style="background:#fee2e2;padding:12px 16px;margin-bottom:16px;border-left:5px solid #dc2626">
          <h2 style="font-size:14px;margin:0 0 8px;color:#7f1d1d">△ What to improve</h2>
          <ul style="margin:0;padding-left:20px;color:#991b1b">
            <li>Flaky CI caused <strong>3 re-runs</strong> on main</li>
            <li>Scope creep on billing webhook refactor</li>
          </ul>
        </div>
        <h2 style="font-size:14px;color:#713f12;margin-bottom:8px">Action items</h2>
        <table border="1" cellpadding="8" style="border-collapse:collapse;width:100%;border-color:#fde047">
          <tr style="background:#713f12;color:#fef08a">
            <td><strong>Action</strong></td>
            <td><strong>Owner</strong></td>
            <td><strong>Due</strong></td>
            <td><strong>Status</strong></td>
          </tr>
          <tr>
            <td>Quarantine flaky Playwright suite</td>
            <td>R. Kim</td>
            <td>Mar 21</td>
            <td><span style="background:#bbf7d0;color:#14532d;padding:1px 6px">On track</span></td>
          </tr>
          <tr style="background:#fefce8">
            <td>Define webhook MVP cut line</td>
            <td>Patel / Lee</td>
            <td>Mar 19</td>
            <td><span style="background:#fde68a;color:#92400e;padding:1px 6px">At risk</span></td>
          </tr>
          <tr>
            <td>Document on-call runbook v3</td>
            <td>Ops</td>
            <td>Mar 28</td>
            <td><span style="background:#fecaca;color:#991b1b;padding:1px 6px">Blocked</span></td>
          </tr>
        </table>
        <p style="font-size:12px;color:#854d0e;margin-top:14px">
          Next retro: <strong>Mar 28, 2026</strong> · celebrate the latency win in all-hands 🎉
        </p>
      </div>
    `,
  },
  {
    name: "invoice",
    title: "Professional Services Invoice",
    category: "financial",
    description:
      "Bill-to header with company logo (imageResolver), line-item table, tax row, and payment terms footer.",
    usesImageResolver: true,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b">
        <table border="0" cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:20px;border-bottom:3px solid #0f172a;font-size:13px">
          <tr>
            <td style="width:50%;vertical-align:top;padding-bottom:14px">
              <p style="margin:0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b">Invoice</p>
              <h1 style="margin:4px 0 0;font-size:28px;color:#0f172a;font-weight:bold">#INV-4821</h1>
            </td>
            <td style="width:50%;vertical-align:top;text-align:right;padding-bottom:14px;color:#475569">
              <img src="logo.png" width="168" height="48" alt="Meridian Analytics logo" style="display:block;margin:0 0 8px auto" />
              <p style="margin:0"><strong>Meridian Analytics, Inc.</strong></p>
              <p style="margin:4px 0 0">1200 Market Street, Suite 400</p>
              <p style="margin:0">San Francisco, CA 94103</p>
            </td>
          </tr>
        </table>
        <table border="0" cellpadding="8" cellspacing="0" style="width:100%;margin-bottom:18px;font-size:13px;background:#f8fafc;border:1px solid #e2e8f0">
          <tr>
            <td style="width:50%;vertical-align:top;border-right:1px solid #e2e8f0" rowspan="4">
              <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#64748b">Bill to</p>
              <p style="margin:0"><strong>Northwind Traders LLC</strong></p>
              <p style="margin:4px 0 0;color:#475569">Attn: Accounts Payable</p>
              <p style="margin:0;color:#475569">88 Harbor Way · Boston, MA 02110</p>
            </td>
            <td style="width:25%;color:#64748b">Invoice date</td>
            <td style="width:25%;text-align:right"><strong>March 15</strong></td>
          </tr>
          <tr>
            <td style="color:#64748b">Due date</td>
            <td style="text-align:right"><strong>April 14</strong></td>
          </tr>
          <tr>
            <td style="color:#64748b">Terms</td>
            <td style="text-align:right">Net 30</td>
          </tr>
          <tr>
            <td style="color:#64748b">PO reference</td>
            <td style="text-align:right">NW-118</td>
          </tr>
        </table>
        <table border="1" cellpadding="10" style="border-collapse:collapse;width:100%;font-size:13px;border-color:#cbd5e1">
          <tr style="background:#0f172a;color:#f8fafc">
            <td style="width:58%"><strong>Description</strong></td>
            <td style="text-align:center;width:10%"><strong>Qty</strong></td>
            <td style="text-align:right;width:16%"><strong>Rate</strong></td>
            <td style="text-align:right;width:16%"><strong>Amount</strong></td>
          </tr>
          <tr>
            <td>Platform migration — Phase 2 (engineering days)</td>
            <td style="text-align:center">12</td>
            <td style="text-align:right;font-family:Consolas,monospace">$185.00</td>
            <td style="text-align:right;font-family:Consolas,monospace">$2,220.00</td>
          </tr>
          <tr style="background:#f8fafc">
            <td>API integration support (hourly)</td>
            <td style="text-align:center">8</td>
            <td style="text-align:right;font-family:Consolas,monospace">$165.00</td>
            <td style="text-align:right;font-family:Consolas,monospace">$1,320.00</td>
          </tr>
          <tr>
            <td>On-site training — Boston (1 day)</td>
            <td style="text-align:center">1</td>
            <td style="text-align:right;font-family:Consolas,monospace">$2,400.00</td>
            <td style="text-align:right;font-family:Consolas,monospace">$2,400.00</td>
          </tr>
        </table>
        <table border="0" cellpadding="6" style="width:100%;margin-top:12px;font-size:13px">
          <tr>
            <td style="width:55%"></td>
            <td style="width:22%;color:#64748b">Subtotal</td>
            <td style="width:23%;text-align:right;font-family:Consolas,monospace">$5,940.00</td>
          </tr>
          <tr>
            <td></td>
            <td style="color:#64748b">Sales tax (6.25%)</td>
            <td style="text-align:right;font-family:Consolas,monospace">$371.25</td>
          </tr>
          <tr style="background:#0f172a;color:#fff">
            <td></td>
            <td style="padding:10px"><strong>Amount due</strong></td>
            <td style="text-align:right;padding:10px;font-family:Consolas,monospace"><strong>$6,311.25</strong></td>
          </tr>
        </table>
        <div style="margin-top:20px;padding:12px 14px;background:#eff6ff;border-left:4px solid #2563eb;font-size:12px;color:#1e40af">
          <strong>Payment instructions:</strong> Wire to Meridian Analytics · Routing 021000021 · Account ending 8842.
          Include invoice <strong>#INV-4821</strong> in the memo line.
        </div>
        <p style="font-size:11px;color:#94a3b8;margin-top:14px">Questions? <a href="mailto:ar@meridian.example" style="color:#2563eb">ar@meridian.example</a> · Thank you for your business.</p>
      </div>
    `,
  },
  {
    name: "balance-sheet",
    title: "Condensed Balance Sheet",
    category: "financial",
    description:
      "Assets, liabilities, and equity sections with subtotals, shaded headers, and balanced totals row.",
    html: `
      <div style="font-family:Georgia,'Times New Roman',serif;color:#1c1917">
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#78716c">Unaudited · Form 10-Q excerpt</p>
        <h1 style="color:#1e3a5f;margin:0 0 4px;font-size:26px;font-weight:normal">Meridian Analytics, Inc.</h1>
        <p style="color:#57534e;margin:0 0 16px;font-size:13px;border-bottom:2px solid #1e3a5f;padding-bottom:8px">
          Condensed Balance Sheet · As of March 31 · (USD, thousands)
        </p>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
          <tr style="background:#1e3a5f;color:#e0f2fe">
            <td><strong>Assets</strong></td>
            <td style="text-align:right;width:120px"><strong>Amount</strong></td>
          </tr>
          <tr><td>Cash and cash equivalents</td><td style="text-align:right">$18,420</td></tr>
          <tr><td>Accounts receivable, net</td><td style="text-align:right">$12,680</td></tr>
          <tr><td>Prepaid expenses</td><td style="text-align:right">$2,140</td></tr>
          <tr style="background:#f0f9ff"><td><strong>Total current assets</strong></td><td style="text-align:right"><strong>$33,240</strong></td></tr>
          <tr><td>Property and equipment, net</td><td style="text-align:right">$4,890</td></tr>
          <tr><td>Goodwill and intangibles</td><td style="text-align:right">$8,200</td></tr>
          <tr style="background:#e0f2fe"><td><strong>Total assets</strong></td><td style="text-align:right"><strong>$46,330</strong></td></tr>
        </table>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px;margin-top:16px">
          <tr style="background:#1e3a5f;color:#e0f2fe">
            <td><strong>Liabilities &amp; stockholders' equity</strong></td>
            <td style="text-align:right;width:120px"><strong>Amount</strong></td>
          </tr>
          <tr><td>Accounts payable</td><td style="text-align:right">$3,820</td></tr>
          <tr><td>Accrued compensation</td><td style="text-align:right">$2,940</td></tr>
          <tr><td>Deferred revenue, current</td><td style="text-align:right">$6,180</td></tr>
          <tr style="background:#f0f9ff"><td><strong>Total current liabilities</strong></td><td style="text-align:right"><strong>$12,940</strong></td></tr>
          <tr><td>Long-term debt</td><td style="text-align:right">$5,000</td></tr>
          <tr><td>Other long-term liabilities</td><td style="text-align:right">$1,240</td></tr>
          <tr style="background:#f0f9ff"><td><strong>Total liabilities</strong></td><td style="text-align:right"><strong>$19,180</strong></td></tr>
          <tr><td>Common stock</td><td style="text-align:right">$120</td></tr>
          <tr><td>Additional paid-in capital</td><td style="text-align:right">$18,600</td></tr>
          <tr><td>Retained earnings</td><td style="text-align:right">$8,430</td></tr>
          <tr style="background:#f0f9ff"><td><strong>Total stockholders' equity</strong></td><td style="text-align:right"><strong>$27,150</strong></td></tr>
          <tr style="background:#e0f2fe"><td><strong>Total liabilities &amp; equity</strong></td><td style="text-align:right"><strong>$46,330</strong></td></tr>
        </table>
        <p style="font-size:11px;color:#78716c;margin-top:12px;font-style:italic">
          See accompanying notes. Prepared by Finance · <a href="#" style="color:#1e3a5f">full 10-Q draft</a>.
        </p>
      </div>
    `,
  },
  {
    name: "sales-contract",
    title: "Software Subscription Agreement",
    category: "legal",
    description:
      "Formal contract with parties block, numbered terms, fee schedule table, and signature lines.",
    html: `
      <div style="font-family:Georgia,'Times New Roman',serif;color:#1c1917;padding:4px 0">
        <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#78716c;text-align:center">Master subscription agreement</p>
        <h1 style="font-size:22px;text-align:center;margin:0 0 4px;font-weight:normal;color:#292524">Software Subscription Agreement</h1>
        <p style="text-align:center;font-size:13px;color:#57534e;margin:0 0 20px;border-bottom:1px solid #d6d3d1;padding-bottom:14px">
          Effective as of April 1 · Atlas CRM Enterprise
        </p>
        <p style="font-size:14px;line-height:1.55;margin-bottom:16px">
          This Software Subscription Agreement ("Agreement") is entered into by and between
          <strong>Meridian Analytics, Inc.</strong> ("Provider"), a Delaware corporation with offices at
          1200 Market Street, San Francisco, CA, and <strong>Northwind Traders LLC</strong> ("Customer"),
          with its principal place of business at 88 Harbor Way, Boston, MA.
        </p>
        <h2 style="font-size:15px;color:#44403c;margin:20px 0 8px;font-weight:bold">1. Subscription &amp; access</h2>
        <p style="font-size:14px;line-height:1.55;margin:0 0 12px">
          Provider grants Customer a non-exclusive, non-transferable right to access the Atlas CRM platform
          for up to <strong>250 named users</strong> during the Initial Term. Customer may not sublicense,
          reverse engineer, or use the service to build a competing product.
        </p>
        <h2 style="font-size:15px;color:#44403c;margin:20px 0 8px;font-weight:bold">2. Fees &amp; payment</h2>
        <table border="1" cellpadding="8" style="border-collapse:collapse;width:100%;font-size:13px;margin-bottom:12px">
          <tr style="background:#44403c;color:#fafaf9">
            <td><strong>Item</strong></td>
            <td style="text-align:right"><strong>Annual fee (USD)</strong></td>
          </tr>
          <tr><td>Atlas CRM Enterprise — 250 seats</td><td style="text-align:right">$186,000</td></tr>
          <tr><td>Premium support (24×5)</td><td style="text-align:right">$24,000</td></tr>
          <tr style="background:#f5f5f4"><td><strong>Total annual fee</strong></td><td style="text-align:right"><strong>$210,000</strong></td></tr>
        </table>
        <p style="font-size:14px;line-height:1.55;margin:0 0 12px">
          Fees are invoiced annually in advance, due <strong>Net 30</strong>. Late payments accrue interest at
          1.5% per month. Customer is responsible for applicable sales and use taxes.
        </p>
        <h2 style="font-size:15px;color:#44403c;margin:20px 0 8px;font-weight:bold">3. Term &amp; termination</h2>
        <p style="font-size:14px;line-height:1.55;margin:0 0 12px">
          The Initial Term is <strong>twelve (12) months</strong>, auto-renewing for successive one-year periods
          unless either party gives written notice at least <strong>sixty (60) days</strong> before renewal.
          Either party may terminate for material breach uncured within thirty (30) days of notice.
        </p>
        <h2 style="font-size:15px;color:#44403c;margin:20px 0 8px;font-weight:bold">4. Confidentiality &amp; data</h2>
        <p style="font-size:14px;line-height:1.55;margin:0 0 12px">
          Each party shall protect the other's Confidential Information with reasonable care. Provider processes
          Customer data solely to deliver the service and maintains SOC 2 Type II controls. Upon termination,
          Provider will delete Customer data within ninety (90) days unless retention is required by law.
        </p>
        <h2 style="font-size:15px;color:#44403c;margin:20px 0 8px;font-weight:bold">5. Limitation of liability</h2>
        <p style="font-size:14px;line-height:1.55;margin:0 0 20px">
          Except for breaches of confidentiality or indemnification obligations, neither party's aggregate
          liability shall exceed fees paid in the <strong>twelve (12) months</strong> preceding the claim.
          Neither party is liable for indirect, incidental, or consequential damages.
        </p>
        <table border="0" cellpadding="0" style="width:100%;margin-top:28px;font-size:13px">
          <tr>
            <td style="width:48%;vertical-align:top;padding-top:40px;border-top:1px solid #1c1917">
              <p style="margin:0"><strong>Meridian Analytics, Inc.</strong></p>
              <p style="margin:8px 0 0;color:#78716c">By: _________________________</p>
              <p style="margin:4px 0 0;color:#78716c">Name: Jordan Lee, VP Sales</p>
              <p style="margin:4px 0 0;color:#78716c">Date: _________________________</p>
            </td>
            <td style="width:4%"></td>
            <td style="width:48%;vertical-align:top;padding-top:40px;border-top:1px solid #1c1917">
              <p style="margin:0"><strong>Northwind Traders LLC</strong></p>
              <p style="margin:8px 0 0;color:#78716c">By: _________________________</p>
              <p style="margin:4px 0 0;color:#78716c">Name: _________________________</p>
              <p style="margin:4px 0 0;color:#78716c">Date: _________________________</p>
            </td>
          </tr>
        </table>
      </div>
    `,
  },
  {
    name: "react-dashboard",
    title: "Q3 Performance Dashboard (React CDN)",
    category: "work-product",
    description:
      "KPI cards from a live React app (CDN, no build); converts the rendered DOM via computed styles.",
    reactPreviewPath: "examples/react-dashboard/preview.html",
  },
];

export function generateShowcaseCases(): ShowcaseCase[] {
  return [...SHOWCASE_CASES];
}
