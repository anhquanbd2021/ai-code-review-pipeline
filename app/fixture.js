// Seeded fixture: one pull request with four real defects, three of them the
// kind a deterministic rule pack catches and one buried three files away.
// Nothing here is random — the same fixture in, the same two reviews out.

export const DIFF = {
  base: 'main',
  head: 'feature/report-filter',
  files: [
    {
      path: 'src/main/java/com/acme/report/ReportService.java',
      language: 'java',
      status: 'modified',
      changed: [24, 25],
      added: [
        {
          line: 24,
          s: '    String label = mapper.label(region).trim();',
        },
        {
          line: 25,
          s: '    return label.isEmpty() ? "unlabelled" : label;',
        },
      ],
      context: [
        { line: 21, s: '  public String describe(String region) {' },
        { line: 22, s: '    Objects.requireNonNull(region, "region");' },
        { line: 23, s: '    try {' },
      ],
      contextAfter: [
        { line: 26, s: '  } catch (DataAccessException e) {' },
        { line: 27, s: '    log.warn("label lookup failed", e);' },
        { line: 28, s: '    return "unlabelled";' },
      ],
    },
    {
      path: 'src/main/java/com/acme/report/ReportRepository.java',
      language: 'java',
      status: 'modified',
      changed: [61],
      added: [
        {
          line: 61,
          s: '        int cap = request.getCap() * 2;  // inline, guarded below',
        },
      ],
      context: [
        { line: 58, s: '  public List<Row> page(PageRequest request) {' },
        {
          line: 59,
          s: '    StringBuilder sql = new StringBuilder("SELECT id, label FROM report_rows");',
        },
        { line: 60, s: '    if (request.getFilter() != null) {' },
      ],
      contextAfter: [
        { line: 62, s: '    if (cap <= 0) cap = 50;' },
        { line: 63, s: '    return jdbc.query(sql.toString(), mapper);' },
      ],
    },
    {
      path: 'src/main/resources/mapper/ReportMapper.xml',
      language: 'xml',
      status: 'modified',
      changed: [12],
      added: [
        {
          line: 12,
          s: '    ORDER BY ${sortColumn}',
        },
      ],
      context: [
        { line: 9, s: '  <select id="pageRows" resultType="Row">' },
        { line: 10, s: '    SELECT id, label FROM report_rows' },
        { line: 11, s: '    <where>' },
      ],
      contextAfter: [
        { line: 13, s: '    </where>' },
        { line: 14, s: '  </select>' },
      ],
    },
    {
      path: 'src/main/java/com/acme/report/ReportController.java',
      language: 'java',
      status: 'modified',
      changed: [33],
      added: [
        {
          line: 33,
          s: '  public String page(@RequestParam(defaultValue = "50") int size) {',
        },
      ],
      context: [
        { line: 31, s: '@RestController' },
        { line: 32, s: 'public class ReportController {' },
      ],
      contextAfter: [
        { line: 34, s: '    model.addAttribute("rows", service.page(size));' },
        { line: 35, s: '    return "report";' },
      ],
    },
    {
      path: 'src/main/resources/templates/report.html',
      language: 'html',
      status: 'modified',
      changed: [47],
      added: [
        {
          line: 47,
          s: '      <td>${item.label}</td>',
        },
      ],
      context: [
        { line: 45, s: '    <table>' },
        { line: 46, s: '      <tr><th>label</th></tr>' },
      ],
      contextAfter: [
        { line: 48, s: '    </table>' },
        { line: 49, s: '  </div>' },
      ],
    },
    {
      path: 'src/main/java/com/acme/report/RateLimiter.java',
      language: 'java',
      status: 'modified',
      changed: [18],
      added: [
        {
          line: 18,
          s: '  private static final List<Long> HITS = new ArrayList<>();',
        },
      ],
      context: [
        { line: 15, s: 'public class RateLimiter {' },
        { line: 16, s: '  private static final long WINDOW_MS = 1_000;' },
        { line: 17, s: '' },
      ],
      contextAfter: [
        { line: 19, s: '' },
        { line: 20, s: '  public boolean allow(long key) {' },
      ],
    },
  ],
  // Never referenced by the diff. A wandering reviewer pays to read these.
  untouched: [
    { path: 'src/main/java/com/acme/report/LegacyUtil.java', tokens: 4_100 },
    { path: 'src/main/java/com/acme/report/ReportMapper.java', tokens: 1_850 },
    { path: 'src/main/java/com/acme/common/Json.java', tokens: 2_400 },
    { path: 'pom.xml', tokens: 3_900 },
    { path: 'src/test/java/com/acme/report/ReportServiceTest.java', tokens: 1_300 },
  ],
};

// Ground truth. Every real finding the fixture contains, pinned by file and
// line — the tally cannot be gamed because both reviews are scored against it.
export const GROUND_TRUTH = [
  {
    id: 'sqli',
    ruleId: 'sqli-string-interpolation',
    file: 'src/main/resources/mapper/ReportMapper.xml',
    line: 12,
    title: 'SQL injection via MyBatis ${} interpolation',
    detail:
      '${sortColumn} is spliced into the SQL text before the driver sees it. A caller can pass "id; DROP TABLE report_rows" or a UNION to exfiltrate rows. #{} binds; ${} does not.',
    severity: 'critical',
  },
  {
    id: 'xss',
    ruleId: 'xss-template-sink',
    file: 'src/main/resources/templates/report.html',
    line: 47,
    title: 'Stored XSS in the rendered report table',
    detail:
      '${item.label} is written into the response body unescaped. A label of <script>… executes for every viewer of the report.',
    severity: 'high',
  },
  {
    id: 'npe',
    ruleId: 'npe-deref',
    file: 'src/main/java/com/acme/report/ReportService.java',
    line: 24,
    title: 'NullPointerException when a region has no label',
    detail:
      'mapper.label() returns null for unknown regions. .trim() on null throws, and the catch block only handles DataAccessException — the NPE escapes the method.',
    severity: 'high',
  },
  {
    id: 'thread',
    ruleId: 'thread-unsafe-static-state',
    file: 'src/main/java/com/acme/report/RateLimiter.java',
    line: 18,
    title: 'Unsynchronised static list shared by all request threads',
    detail:
      'HITS is a mutable ArrayList on a singleton. Concurrent allow() calls corrupt it and the rate limit silently stops counting.',
    severity: 'high',
  },
];

export const NON_DEFECTS = [
  {
    file: 'src/main/java/com/acme/report/ReportController.java',
    line: 33,
    why: 'size has an explicit default and is bounded by the framework binder',
  },
];
