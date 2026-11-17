// NFL History.exe - the player's app for the NFL History mod. Double-click it like any program:
//   - no terminal window: it runs mod\launcher.mjs hidden (NFL_APP=1) and shows progress in its own small window
//   - first run gets a private Node 24 (and Git if missing), then the launcher sets up Football GM; later runs start in seconds
//   - safe to pin or shortcut: it always works from its own folder, and a second launch just brings the game back up
//   - opens the game in its own window (the player's Edge/Chrome/Brave in app mode, same profile so leagues stay put)
//   - What's new after every update, the full changelog, update alerts (a Windows notification plus a banner), Check for updates
//   - lives in the system tray while the game runs; Quit stops the game cleanly
// Install_and_Play.bat does the same in a terminal and stays as the fallback.
// Build: app\build_exe.bat (uses the C# compiler that ships with Windows; nothing to install)
// Testing: NFL_RELEASE_API points the update check at another URL (file:/// works too).
using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

// the name Windows shows on notifications, in Task Manager and in file properties
[assembly: System.Reflection.AssemblyTitle("NFL History")]
[assembly: System.Reflection.AssemblyProduct("NFL History for Football GM")]
[assembly: System.Reflection.AssemblyDescription("NFL History")]
[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]

static class App {
  const string NODEVER = "v24.22.2";
  public const string GAME_URL = "http://localhost:3000";
  public const string REPO_URL = "https://github.com/JenZiMiBruh/nfl-history-fbgm";
  public static string Root;
  public static bool Background; // started with Windows: stay in the tray until asked
  static EventWaitHandle ShowSignal;

  [STAThread]
  static void Main(string[] args) {
    Application.EnableVisualStyles();
    Application.SetCompatibleTextRenderingDefault(false);
    Root = Path.GetDirectoryName(Application.ExecutablePath);
    Background = args.Contains("--background");
    try { File.Delete(Path.Combine(Root, "NFL History.exe.old")); } catch { } // left behind by an update
    bool first;
    using (var one = new Mutex(true, "NFLHistoryMod_App", out first)) {
      if (!first) {
        // already running: ask that copy to come forward and open the game
        try { EventWaitHandle.OpenExisting("NFLHistoryMod_Show").Set(); } catch { OpenGame(); }
        return;
      }
      ShowSignal = new EventWaitHandle(false, EventResetMode.AutoReset, "NFLHistoryMod_Show");
      if (GameAlive()) { OpenGame(); return; } // started by Install_and_Play in a terminal: just open it
      var form = new MainForm();
      var h = form.Handle; // so the worker can talk to it before it's shown
      var t = new Thread(() => { while (true) { ShowSignal.WaitOne(); try { form.BeginInvoke((Action)(() => form.BringBack(true))); } catch { return; } } }) { IsBackground = true };
      t.Start();
      form.Start();
      if (!Background) form.Show();
      Application.Run();
    }
  }

  // ---------- settings (app-settings.txt in this folder; never in the zip, so updates keep them) ----------
  static Dictionary<string, string> settings;
  static string SettingsFile { get { return Path.Combine(Root, "app-settings.txt"); } }
  public static string Get(string key, string def) {
    if (settings == null) {
      settings = new Dictionary<string, string>();
      try { foreach (var l in File.ReadAllLines(SettingsFile)) { var i = l.IndexOf('='); if (i > 0) settings[l.Substring(0, i).Trim()] = l.Substring(i + 1).Trim(); } } catch { }
    }
    string v; return settings.TryGetValue(key, out v) ? v : def;
  }
  public static void Set(string key, string value) {
    Get(key, null); settings[key] = value;
    try { File.WriteAllLines(SettingsFile, settings.Select(kv => kv.Key + "=" + kv.Value)); } catch { }
  }
  public static bool On(string key, bool def) { return Get(key, def ? "1" : "0") == "1"; }

  public static string Version() {
    try { var m = Regex.Match(File.ReadAllText(Path.Combine(Root, "mod", "version.json")), "\"version\"\\s*:\\s*\"([^\"]+)\""); return m.Success ? m.Groups[1].Value : "?"; } catch { return "?"; }
  }
  public static bool Alpha() { try { return File.ReadAllText(Path.Combine(Root, "channel.txt")).Trim() == "alpha"; } catch { return false; } }

  public static bool GameAlive() {
    try {
      var req = (HttpWebRequest)WebRequest.Create(GAME_URL);
      req.Timeout = 3000; req.Proxy = null; req.KeepAlive = false; // no system proxy lookup, no pooled connections
      using (var res = (HttpWebResponse)req.GetResponse()) return (int)res.StatusCode < 500;
    } catch (WebException e) {
      // any answer (even an error page) means the server is up; always close it, or .NET runs out of connections
      if (e.Response != null) { e.Response.Close(); return true; }
      return false;
    } catch { return false; }
  }

  // ---------- opening the game ----------
  // In its own window: the player's default browser in app mode (no tabs or address bar). It uses their normal browser
  // profile on purpose, because leagues are saved in the browser: a separate profile would hide them.
  public static void OpenGame() {
    if (On("appwindow", true)) {
      var b = AppBrowser();
      if (b != null) {
        try { Process.Start(new ProcessStartInfo(b, "--app=" + GAME_URL) { UseShellExecute = false }); return; } catch (Exception e) { LogLine("app window: " + e.Message); }
      }
    }
    OpenUrl(GAME_URL);
  }
  static string AppBrowser() {
    string prog = "";
    try { using (var k = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice")) prog = (k == null ? "" : (string)k.GetValue("ProgId")) ?? ""; } catch { }
    var pf = Environment.GetEnvironmentVariable("ProgramFiles"); var pf86 = Environment.GetEnvironmentVariable("ProgramFiles(x86)"); var la = Environment.GetEnvironmentVariable("LOCALAPPDATA");
    string[] edge = { pf86 + @"\Microsoft\Edge\Application\msedge.exe", pf + @"\Microsoft\Edge\Application\msedge.exe" };
    string[] chrome = { pf + @"\Google\Chrome\Application\chrome.exe", pf86 + @"\Google\Chrome\Application\chrome.exe", la + @"\Google\Chrome\Application\chrome.exe" };
    string[] brave = { pf + @"\BraveSoftware\Brave-Browser\Application\brave.exe", la + @"\BraveSoftware\Brave-Browser\Application\brave.exe" };
    string[] list = prog.StartsWith("MSEdge") ? edge : prog.StartsWith("ChromeHTML") ? chrome : prog.StartsWith("Brave") ? brave : null;
    if (list == null) return null; // Firefox and others have no app mode: a normal tab
    return list.FirstOrDefault(File.Exists);
  }
  public static void OpenUrl(string url) { try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { } }

  public static string Log { get { return Path.Combine(Root, "install_log.txt"); } }
  // shared open: the game server keeps the same log open for writing while it runs
  public static void LogLine(string s) {
    try {
      using (var f = new FileStream(Log, FileMode.Append, FileAccess.Write, FileShare.ReadWrite | FileShare.Delete))
      using (var w = new StreamWriter(f)) w.Write("[" + DateTime.UtcNow.ToString("o") + "] app: " + s + "\r\n");
    } catch { }
  }
  public static string LogTail(int lines) {
    try {
      using (var f = new FileStream(Log, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
      using (var r = new StreamReader(f)) { var all = r.ReadToEnd().Split('\n'); return string.Join("\n", all.Skip(Math.Max(0, all.Length - lines))).Trim(); }
    } catch { return ""; }
  }

  // Runs a program with no window and waits; returns its exit code
  public static int RunHidden(string file, string args, int timeoutMs) {
    LogLine("$ " + file + " " + args);
    var psi = new ProcessStartInfo(file, args) { UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden, WorkingDirectory = Root, RedirectStandardOutput = true, RedirectStandardError = true };
    using (var p = Process.Start(psi)) {
      var o = p.StandardOutput.ReadToEndAsync(); var e = p.StandardError.ReadToEndAsync();
      if (!p.WaitForExit(timeoutMs)) { try { p.Kill(); } catch { } return -1; }
      LogLine((o.Result + e.Result).Trim());
      return p.ExitCode;
    }
  }

  // ---------- first-time setup: Node and Git ----------
  public static string NodeDir { get { return Path.Combine(Root, "node"); } }

  public static void EnsureNode(Action<string> status) {
    if (File.Exists(Path.Combine(NodeDir, "node.exe"))) return;
    status("Downloading Node.js (about 30 MB, only the first time)...");
    ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
    var zip = Path.Combine(Path.GetTempPath(), "nfl-node-" + Guid.NewGuid().ToString("N") + ".zip");
    using (var wc = new WebClient()) {
      wc.Headers.Add("User-Agent", "nfl-history-fbgm-app");
      wc.DownloadFile("https://nodejs.org/dist/" + NODEVER + "/node-" + NODEVER + "-win-x64.zip", zip);
    }
    status("Unpacking Node.js...");
    var unpacked = Path.Combine(Root, "node-" + NODEVER + "-win-x64");
    try { if (Directory.Exists(unpacked)) Directory.Delete(unpacked, true); } catch { }
    var tar = Path.Combine(Environment.SystemDirectory, "tar.exe");
    if (!File.Exists(tar) || RunHidden(tar, "-xf \"" + zip + "\" -C \"" + Root + "\"", 600000) != 0)
      System.IO.Compression.ZipFile.ExtractToDirectory(zip, Root);
    Directory.Move(unpacked, NodeDir);
    try { File.Delete(zip); } catch { }
  }

  static string GitCmdDir() {
    foreach (var dir in new[] { Environment.GetEnvironmentVariable("ProgramFiles"), Environment.GetEnvironmentVariable("ProgramW6432"), Environment.GetEnvironmentVariable("LOCALAPPDATA") + "\\Programs" }) {
      if (string.IsNullOrEmpty(dir)) continue;
      var d = Path.Combine(dir, "Git", "cmd");
      if (File.Exists(Path.Combine(d, "git.exe"))) return d;
    }
    return null;
  }
  static bool GitOnPath() { try { return RunHidden("git", "--version", 20000) == 0; } catch { return false; } }

  // Returns an extra folder to put on PATH for git (or null when git is already reachable)
  public static string EnsureGit(Action<string> status) {
    if (GitOnPath()) return null;
    var d = GitCmdDir();
    if (d != null) return d;
    status("Installing Git (Windows may ask for permission)...");
    try { RunHidden("winget", "install -e --id Git.Git --silent --accept-source-agreements --accept-package-agreements", 900000); } catch (Exception e) { LogLine("winget: " + e.Message); }
    d = GitCmdDir();
    if (d == null && !GitOnPath()) throw new Exception("Git couldn't be installed automatically. Install it from git-scm.com, then open NFL History again.");
    return d;
  }

  // ---------- shortcuts and Start with Windows ----------
  public static void OfferShortcuts(IWin32Window owner) {
    if (Get("shortcuts-asked", "") != "" || File.Exists(Path.Combine(Root, ".shortcuts-asked"))) return;
    Set("shortcuts-asked", "1");
    if (MessageBox.Show(owner, "Add NFL History to your Start menu and desktop?\n\nThen you can open it like any other program.", "NFL History", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes) MakeShortcuts(owner);
  }
  public static void MakeShortcuts(IWin32Window owner) {
    try {
      MakeShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "NFL History.lnk"));
      MakeShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "NFL History.lnk"));
    } catch (Exception e) { LogLine("shortcuts: " + e.Message); MessageBox.Show(owner, "Couldn't make the shortcuts: " + e.Message, "NFL History"); }
  }
  static void MakeShortcut(string lnk) {
    var shell = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
    dynamic s = shell.GetType().InvokeMember("CreateShortcut", System.Reflection.BindingFlags.InvokeMethod, null, shell, new object[] { lnk });
    s.TargetPath = Application.ExecutablePath;
    s.WorkingDirectory = Root;
    s.IconLocation = Application.ExecutablePath + ",0";
    s.Description = "NFL History for Football GM";
    s.Save();
  }
  const string RUN_KEY = @"Software\Microsoft\Windows\CurrentVersion\Run";
  public static bool StartsWithWindows() {
    try { using (var k = Registry.CurrentUser.OpenSubKey(RUN_KEY)) return k != null && k.GetValue("NFL History") != null; } catch { return false; }
  }
  public static void SetStartWithWindows(bool on) {
    try {
      using (var k = Registry.CurrentUser.CreateSubKey(RUN_KEY)) {
        if (on) k.SetValue("NFL History", "\"" + Application.ExecutablePath + "\" --background");
        else k.DeleteValue("NFL History", false);
      }
    } catch (Exception e) { LogLine("start with windows: " + e.Message); }
  }

  public static void KillTree(Process p) {
    if (p == null) return;
    try { if (p.HasExited) return; } catch { return; }
    RunHidden("taskkill", "/PID " + p.Id + " /T /F", 20000);
  }

  // ---------- updates ----------
  public class Release { public string Tag, Version, Notes; }
  // The newest release on this player's channel (the same rules as the launcher), or null when it can't be reached
  public static Release Latest() {
    ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
    var api = Environment.GetEnvironmentVariable("NFL_RELEASE_API");
    var list = Environment.GetEnvironmentVariable("NFL_RELEASES_API"); // testing: the alpha channel's list (as in the launcher)
    bool alpha = Alpha() && (string.IsNullOrEmpty(api) || !string.IsNullOrEmpty(list));
    var url = alpha ? (!string.IsNullOrEmpty(list) ? list : "https://api.github.com/repos/JenZiMiBruh/nfl-history-fbgm/releases?per_page=30")
      : !string.IsNullOrEmpty(api) ? api : "https://api.github.com/repos/JenZiMiBruh/nfl-history-fbgm/releases/latest";
    try {
      var req = WebRequest.Create(url);
      req.Timeout = 10000;
      var http = req as HttpWebRequest;
      if (http != null) http.UserAgent = "nfl-history-fbgm-app";
      string json;
      using (var res = req.GetResponse()) using (var r = new StreamReader(res.GetResponseStream())) json = r.ReadToEnd();
      var js = new JavaScriptSerializer { MaxJsonLength = 1 << 26 };
      object data = js.DeserializeObject(json);
      Dictionary<string, object> rel = null;
      if (alpha) {
        foreach (var o in (IEnumerable)data) {
          var d = (Dictionary<string, object>)o;
          if (Equals(d["prerelease"], true) && !Equals(d["draft"], true) && ((string)d["tag_name"]).StartsWith("live-alpha")) { rel = d; break; }
        }
      } else rel = data as Dictionary<string, object>;
      if (rel == null) return null;
      var tag = (string)rel["tag_name"];
      object body; rel.TryGetValue("body", out body);
      return new Release { Tag = tag, Version = Regex.Replace(tag, "^(v|live-alpha-)", ""), Notes = ((body as string) ?? "").Split(new[] { "| File |" }, StringSplitOptions.None)[0] };
    } catch (Exception e) { LogLine("update check: " + e.Message); return null; }
  }
  public static bool IsNewer(string a, string b) {
    // alpha builds: any other alpha number is the update ("3" from the tag live-alpha-3 against 1.26.0-alpha.3 installed)
    if (Alpha()) { var na = Regex.Match(a, @"(\d+)$").Groups[1].Value; var nb = Regex.Match(b, @"alpha[.-](\d+)$").Groups[1].Value; return nb == "" || na != nb; }
    var pa = a.TrimStart('v').Split('.'); var pb = b.TrimStart('v').Split('.');
    for (int i = 0; i < Math.Max(pa.Length, pb.Length); i++) {
      int x = 0, y = 0; if (i < pa.Length) int.TryParse(pa[i], out x); if (i < pb.Length) int.TryParse(pb[i], out y);
      if (x != y) return x > y;
    }
    return false;
  }
  // Asks the running launcher to update (the same request the game's Update button sends). Returns the HTTP status.
  public static int AskLauncherToUpdate() { return AskLauncher("/update"); }
  // The Live Football alpha switch (the same request the game's alpha card sends): to = "alpha" or "stable"
  public static int AskLauncherToSwitch(string to) { return AskLauncher("/channel?to=" + to); }
  // Is the alpha out? (the site's live-alpha.json, the same switch the game's card reads)
  public static bool AlphaOut() {
    try {
      ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
      var req = (HttpWebRequest)WebRequest.Create("https://jenzimibruh.github.io/nfl-history-fbgm/data/live-alpha.json?t=" + DateTime.UtcNow.Ticks);
      req.Timeout = 8000; req.UserAgent = "nfl-history-fbgm-app";
      using (var res = req.GetResponse()) using (var r = new StreamReader(res.GetResponseStream())) return Regex.IsMatch(r.ReadToEnd(), "\"active\"\\s*:\\s*true");
    } catch (Exception e) { LogLine("alpha check: " + e.Message); return false; }
  }
  static int AskLauncher(string what) {
    try {
      var req = (HttpWebRequest)WebRequest.Create("http://localhost:3099" + what);
      req.Method = "POST"; req.Proxy = null; req.Timeout = 5000; req.ContentLength = 0;
      req.Headers["Origin"] = GAME_URL;
      using (var res = (HttpWebResponse)req.GetResponse()) return (int)res.StatusCode;
    } catch (WebException e) { if (e.Response != null) { var c = (int)((HttpWebResponse)e.Response).StatusCode; e.Response.Close(); return c; } return 0; } catch { return 0; }
  }

  // ---------- the changelog ----------
  public static string Changelog() {
    foreach (var f in new[] { Path.Combine(Root, "mod", "public", "nfl", "CHANGELOG.md"), Path.Combine(Root, "CHANGELOG.md") })
      try { if (File.Exists(f)) return File.ReadAllText(f); } catch { }
    return "";
  }
  // Every "## v..." section newer than `since` (all of them when since is empty)
  public static string SectionsSince(string md, string since, int max) {
    var parts = Regex.Split(md, @"(?m)^(?=## )");
    var keep = new List<string>();
    foreach (var p in parts) {
      var m = Regex.Match(p, @"^## v?([0-9][^\s·]*)");
      if (!m.Success) continue;
      if (since != "" && !IsNewer(m.Groups[1].Value, since)) break;
      keep.Add(p.Trim());
      if (keep.Count >= max) break;
    }
    return string.Join("\n\n", keep);
  }
}

// ---------- shared look ----------
static class Look {
  public static readonly Color Bg = Color.FromArgb(14, 22, 40), Panel2 = Color.FromArgb(24, 36, 62), Hover = Color.FromArgb(40, 56, 90),
    Accent = Color.FromArgb(213, 10, 10), AccentHover = Color.FromArgb(235, 40, 40), Fg = Color.FromArgb(236, 240, 247), Dim = Color.FromArgb(150, 162, 186),
    Gold = Color.FromArgb(255, 196, 0), BannerBg = Color.FromArgb(38, 52, 20);
  public static Button Button(string text, bool primary, Point at, int w) {
    var b = new Button { Text = text, BackColor = primary ? Accent : Panel2, ForeColor = Fg, FlatStyle = FlatStyle.Flat, Location = at, Size = new Size(w, 34), Cursor = Cursors.Hand, UseVisualStyleBackColor = false };
    b.FlatAppearance.BorderSize = 0;
    b.FlatAppearance.MouseOverBackColor = primary ? AccentHover : Hover;
    return b;
  }
  public static LinkLabel Link(string text, Point at) {
    var l = new LinkLabel { Text = text, AutoSize = true, Location = at, LinkColor = Dim, ActiveLinkColor = Fg, VisitedLinkColor = Dim, LinkBehavior = LinkBehavior.HoverUnderline, Font = new Font("Segoe UI", 9f) };
    return l;
  }
  public static Icon AppIcon() { try { return Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { return SystemIcons.Application; } }
  public static void Style(Form f, string title) {
    f.Text = title; f.Icon = AppIcon(); f.BackColor = Bg; f.ForeColor = Fg; f.Font = new Font("Segoe UI", 10f);
    f.StartPosition = FormStartPosition.CenterScreen;
  }
}

// What's new / changelog / update notes: markdown shown as formatted text, with an optional action button
class NotesForm : Form {
  public NotesForm(string title, string heading, string markdown, string actionText, Action action) {
    Look.Style(this, title);
    ClientSize = new Size(600, 560); MinimumSize = new Size(420, 320);
    var head = new Label { Text = heading, Font = new Font("Segoe UI", 15f, FontStyle.Bold), AutoSize = false, Location = new Point(20, 14), Size = new Size(560, 34), Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right };
    var box = new RichTextBox { Location = new Point(20, 56), Size = new Size(560, 440), ReadOnly = true, BorderStyle = BorderStyle.None, BackColor = Look.Panel2, ForeColor = Look.Fg, Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right, DetectUrls = false };
    Render(box, markdown);
    var close = Look.Button("Close", action == null, new Point(480, 510), 100);
    close.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
    close.Click += (s, e) => Close();
    Controls.AddRange(new Control[] { head, box, close });
    if (action != null) {
      var act = Look.Button(actionText, true, new Point(330, 510), 140);
      act.Anchor = AnchorStyles.Bottom | AnchorStyles.Right;
      act.Click += (s, e) => { Close(); action(); };
      Controls.Add(act);
      AcceptButton = act;
    } else AcceptButton = close;
    CancelButton = close;
  }

  static void Render(RichTextBox box, string md) {
    var body = new Font("Segoe UI", 10.5f); var h2 = new Font("Segoe UI", 13f, FontStyle.Bold); var bold = new Font("Segoe UI", 10.5f, FontStyle.Bold);
    box.SelectionIndent = 8; box.SelectionRightIndent = 8;
    foreach (var raw in md.Replace("\r", "").Split('\n')) {
      var line = Regex.Replace(raw, @"\[([^\]]+)\]\([^)]+\)", "$1").TrimEnd();
      if (line.StartsWith("# ") || line == "---") continue;
      if (line.StartsWith("## ") || line.StartsWith("### ")) {
        box.SelectionFont = h2; box.SelectionColor = Look.Gold; box.SelectionBullet = false;
        box.AppendText("\n" + line.TrimStart('#', ' ').Replace("**", "") + "\n");
      } else if (line.StartsWith("- ") || line.StartsWith("* ")) {
        var t = line.Substring(2);
        // "Headline.** rest": the part up to the first ** is the bold headline
        var i = t.Replace("**", "\u0001").IndexOf('\u0001', t.StartsWith("**") ? 1 : 0);
        var clean = t.Replace("**", "");
        box.SelectionBullet = true; box.SelectionColor = Look.Fg;
        if (i > 0) {
          var headLen = t.Substring(0, i).Replace("**", "").Length;
          box.SelectionFont = bold; box.AppendText(clean.Substring(0, headLen));
          box.SelectionFont = body; box.AppendText(clean.Substring(headLen) + "\n");
        } else { box.SelectionFont = body; box.AppendText(clean + "\n"); }
        box.SelectionBullet = false;
      } else if (line.Trim().Length > 0) {
        box.SelectionBullet = false; box.SelectionColor = line.StartsWith("**") ? Look.Fg : Look.Dim;
        box.SelectionFont = line.StartsWith("**") ? bold : body;
        box.AppendText(line.Replace("**", "") + "\n");
      }
    }
    box.SelectionStart = 0; box.ScrollToCaret();
  }
}

class SettingsForm : Form {
  public SettingsForm() {
    Look.Style(this, "NFL History settings");
    FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = MinimizeBox = false;
    ClientSize = new Size(440, 330);
    var head = new Label { Text = "Settings", Font = new Font("Segoe UI", 15f, FontStyle.Bold), AutoSize = true, Location = new Point(20, 14) };
    var appWin = Check("Open the game in its own window (no tabs or address bar)", 64, App.On("appwindow", true));
    var notify = Check("Tell me when an update is out", 96, App.On("notify", true));
    var tray = Check("Keep running in the tray when I close this window", 128, App.On("tray", true));
    var boot = Check("Start NFL History when Windows starts (in the tray)", 160, App.StartsWithWindows());
    var shortcuts = Look.Button("Add Start menu and desktop shortcuts", false, new Point(20, 204), 280);
    shortcuts.Click += (s, e) => { App.MakeShortcuts(this); shortcuts.Text = "Shortcuts added"; };
    var folder = Look.Link("Open the mod folder", new Point(20, 252)); folder.Click += (s, e) => App.OpenUrl(App.Root);
    var log = Look.Link("Open the log", new Point(160, 252)); log.Click += (s, e) => App.OpenUrl(App.Log);
    var ok = Look.Button("Done", true, new Point(320, 284), 100);
    ok.Click += (s, e) => {
      App.Set("appwindow", appWin.Checked ? "1" : "0"); App.Set("notify", notify.Checked ? "1" : "0"); App.Set("tray", tray.Checked ? "1" : "0");
      if (boot.Checked != App.StartsWithWindows()) App.SetStartWithWindows(boot.Checked);
      Close();
    };
    AcceptButton = ok;
    Controls.AddRange(new Control[] { head, appWin, notify, tray, boot, shortcuts, folder, log, ok });
  }
  CheckBox Check(string text, int y, bool on) { return new CheckBox { Text = text, Checked = on, AutoSize = true, Location = new Point(22, y), ForeColor = Look.Fg }; }
}

class MainForm : Form {
  readonly Label stepLabel, detailLabel, phoneLabel, phoneHelp, versionLabel, bannerText;
  readonly ProgressBar bar;
  readonly PictureBox qr;
  readonly Panel body, banner, footer, alphaBanner;
  readonly Button openBtn, quitBtn, logBtn, reportBtn, copyBtn, bannerBtn, alphaBtn;
  readonly LinkLabel backLink;
  bool alphaOut;
  readonly NotifyIcon tray;
  readonly System.Windows.Forms.Timer checkTimer;
  Process launcher;
  bool ready, openedOnce, quitting, failed, trayHintShown, updating, movedFromBat;
  string phoneUrl = "";
  App.Release pending; // an update that's out but not installed
  string notified = "";

  public MainForm() {
    Look.Style(this, "NFL History");
    FormBorderStyle = FormBorderStyle.FixedSingle; MaximizeBox = false;
    ClientSize = new Size(540, 330);

    var stripe = new Panel { BackColor = Look.Accent, Location = new Point(0, 0), Size = new Size(6, 2000) };
    var title = new Label { Text = "NFL HISTORY", Font = new Font("Segoe UI", 20f, FontStyle.Bold), AutoSize = true, Location = new Point(24, 16) };
    var sub = new Label { Text = "for Football GM", ForeColor = Look.Dim, AutoSize = true, Location = new Point(28, 56) };
    versionLabel = new Label { ForeColor = Look.Dim, AutoSize = false, TextAlign = ContentAlignment.TopRight, Location = new Point(300, 24), Size = new Size(216, 40), Font = new Font("Segoe UI", 9f) };

    // the update banner (hidden until an update is out)
    banner = new Panel { BackColor = Look.BannerBg, Location = new Point(6, 86), Size = new Size(534, 44), Visible = false };
    bannerText = new Label { ForeColor = Look.Fg, Font = new Font("Segoe UI", 10f, FontStyle.Bold), AutoSize = false, Location = new Point(18, 12), Size = new Size(300, 22), Cursor = Cursors.Hand };
    bannerText.Click += (s, e) => ShowPendingNotes();
    bannerBtn = Look.Button("Update now", true, new Point(404, 6), 112); bannerBtn.Height = 32;
    bannerBtn.Click += (s, e) => StartUpdate();
    var details = Look.Link("What's in it", new Point(316, 14)); details.LinkColor = Look.Gold;
    details.Click += (s, e) => ShowPendingNotes();
    banner.Controls.AddRange(new Control[] { bannerText, details, bannerBtn });

    // the Live Football alpha (regular mod, while the alpha is out): one click switches, the launcher does the rest
    alphaBanner = new Panel { BackColor = Color.FromArgb(10, 14, 20), Location = new Point(6, 86), Size = new Size(534, 44), Visible = false };
    var alphaText = new Label { Text = "LIVE FOOTBALL ALPHA IS OUT", ForeColor = Look.Gold, Font = new Font("Segoe UI", 10f, FontStyle.Bold), AutoSize = false, Location = new Point(18, 12), Size = new Size(240, 22) };
    var alphaMore = Look.Link("What is it?", new Point(262, 14)); alphaMore.LinkColor = Look.Fg;
    alphaMore.Click += (s, e) => MessageBox.Show(this, "Watch any game in your league play out on the field, with a TV-style broadcast around it.\n\nClick Play the alpha: NFL History downloads it and restarts the game by itself (a few minutes the first time). Your leagues stay where they are.\n\nIt's an early alpha, so expect rough edges. You can go back to the regular mod any time.", "Live Football alpha");
    alphaBtn = Look.Button("Play the alpha", true, new Point(380, 6), 136); alphaBtn.Height = 32;
    alphaBtn.Click += (s, e) => Switch("alpha");
    alphaBanner.Controls.AddRange(new Control[] { alphaText, alphaMore, alphaBtn });

    body = new Panel { Location = new Point(6, 86), Size = new Size(534, 200), BackColor = Look.Bg };
    stepLabel = new Label { Text = "Starting...", Font = new Font("Segoe UI", 12f, FontStyle.Bold), AutoSize = false, Location = new Point(18, 8), Size = new Size(492, 26) };
    bar = new ProgressBar { Location = new Point(18, 38), Size = new Size(492, 14), Maximum = 5, Style = ProgressBarStyle.Continuous };
    detailLabel = new Label { Text = "", ForeColor = Look.Dim, AutoSize = false, Location = new Point(18, 60), Size = new Size(492, 90) };
    phoneLabel = new Label { Font = new Font("Segoe UI", 10.5f, FontStyle.Bold), AutoSize = false, Location = new Point(18, 42), Size = new Size(320, 44), Visible = false };
    phoneHelp = new Label { Text = "Phone on the same Wi-Fi: scan the code or type the address.\nCan't reach it? Android: allow Chrome \"Nearby devices\", then force stop Chrome. Windows firewall: allow Node.js on private networks. Turn off any VPN.", ForeColor = Look.Dim, Font = new Font("Segoe UI", 8.5f), AutoSize = false, Location = new Point(18, 88), Size = new Size(320, 90), Visible = false };
    qr = new PictureBox { Location = new Point(354, 8), Size = new Size(156, 156), SizeMode = PictureBoxSizeMode.Zoom, BackColor = Color.White, Visible = false };
    openBtn = Look.Button("Open the game", true, new Point(18, 150), 150); openBtn.Visible = false;
    quitBtn = Look.Button("Quit", false, new Point(178, 150), 90);
    reportBtn = Look.Button("Report it", true, new Point(18, 150), 110); reportBtn.Visible = false;
    copyBtn = Look.Button("Copy details", false, new Point(138, 150), 120); copyBtn.Visible = false;
    logBtn = Look.Button("Open the log", false, new Point(268, 150), 120); logBtn.Visible = false;
    openBtn.Click += (s, e) => App.OpenGame();
    quitBtn.Click += (s, e) => Quit(true);
    reportBtn.Click += (s, e) => App.OpenUrl(App.REPO_URL + "/issues/new/choose");
    copyBtn.Click += (s, e) => { try { Clipboard.SetText("NFL History v" + App.Version() + (App.Alpha() ? " (alpha)" : "") + "\n" + Environment.OSVersion + "\n\n" + App.LogTail(40)); copyBtn.Text = "Copied"; } catch { } };
    logBtn.Click += (s, e) => App.OpenUrl(App.Log);
    body.Controls.AddRange(new Control[] { stepLabel, bar, detailLabel, phoneLabel, phoneHelp, qr, openBtn, quitBtn, reportBtn, copyBtn, logBtn });

    // footer links
    footer = new Panel { Location = new Point(6, 290), Size = new Size(534, 34), BackColor = Look.Bg };
    var sep = new Panel { BackColor = Look.Panel2, Location = new Point(18, 0), Size = new Size(498, 1) };
    var news = Look.Link("What's new", new Point(16, 9)); news.Click += (s, e) => ShowChangelog();
    var check = Look.Link("Check for updates", new Point(104, 9)); check.Click += (s, e) => CheckForUpdates(true);
    var set = Look.Link("Settings", new Point(232, 9)); set.Click += (s, e) => { using (var f = new SettingsForm()) f.ShowDialog(this); };
    var about = Look.Link("About", new Point(298, 9)); about.Click += (s, e) => ShowAbout();
    backLink = Look.Link("Back to the regular mod", new Point(350, 9)); backLink.Visible = false;
    backLink.Click += (s, e) => { if (MessageBox.Show(this, "Leave the Live Football alpha and go back to the regular mod? The game restarts by itself; your leagues stay where they are.", "NFL History", MessageBoxButtons.OKCancel, MessageBoxIcon.Question) == DialogResult.OK) Switch("stable"); };
    footer.Controls.AddRange(new Control[] { sep, news, check, set, about, backLink });

    Controls.AddRange(new Control[] { stripe, title, sub, versionLabel, banner, alphaBanner, body, footer });

    // the tray icon: open the game, show this window, check for updates, quit
    var menu = new ContextMenuStrip();
    menu.Items.Add("Open the game", null, (s, e) => App.OpenGame());
    menu.Items.Add("Show NFL History", null, (s, e) => BringBack(false));
    menu.Items.Add("What's new", null, (s, e) => ShowChangelog());
    menu.Items.Add("Check for updates", null, (s, e) => CheckForUpdates(true));
    menu.Items.Add(new ToolStripSeparator());
    menu.Items.Add("Quit NFL History", null, (s, e) => Quit(true));
    ((ToolStripMenuItem)menu.Items[0]).Font = new Font(menu.Font, FontStyle.Bold);
    tray = new NotifyIcon { Icon = Look.AppIcon(), Text = "NFL History", ContextMenuStrip = menu, Visible = true };
    tray.DoubleClick += (s, e) => BringBack(true);
    tray.BalloonTipClicked += (s, e) => { if (pending != null) { BringBack(false); ShowPendingNotes(); } else BringBack(false); };

    // update check: every 30 minutes while the game runs
    // (the first one a minute after the game is up, in case a release came out since the launcher checked)
    checkTimer = new System.Windows.Forms.Timer { Interval = 60 * 1000 };
    checkTimer.Tick += (s, e) => { checkTimer.Interval = 30 * 60 * 1000; CheckForUpdates(false); };

    RefreshVersion();
    Relayout();
  }

  public void Start() { new Thread(Work) { IsBackground = true }.Start(); }

  void RefreshVersion() { versionLabel.Text = "v" + App.Version() + (App.Alpha() ? "\nLive Football alpha" : ""); }

  void Ui(Action a) { try { if (!IsDisposed) BeginInvoke(a); } catch { } }
  void Step(int n, string text) { Ui(() => { stepLabel.Text = (ready || updating ? "Updating... " : "Setting up... ") + n + " of 5: " + text; bar.Value = Math.Max(0, Math.Min(5, n - 1)); detailLabel.Text = ""; }); }
  void Detail(string s) { Ui(() => { detailLabel.Text = s; }); }

  public void BringBack(bool openGame) {
    Show();
    if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
    Activate(); TopMost = true; TopMost = false;
    if (openGame && ready) App.OpenGame();
  }

  void Work() {
    try {
      App.LogLine("NFL History app v" + App.Version() + " starting in " + App.Root);
      // A player moving over from Install_and_Play: the game was already set up before the app's first start
      movedFromBat = App.Get("shortcuts-asked", "") == "" && !File.Exists(Path.Combine(App.Root, ".shortcuts-asked")) &&
        File.Exists(Path.Combine(App.Root, "football-gm", ".nfl-installed"));
      Ui(() => stepLabel.Text = "Getting ready...");
      App.EnsureNode(Detail);
      var gitDir = App.EnsureGit(Detail);
      var node = Path.Combine(App.NodeDir, "node.exe");
      var psi = new ProcessStartInfo(node, "\"" + Path.Combine(App.Root, "mod", "launcher.mjs") + "\"") {
        UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden, WorkingDirectory = App.Root,
        RedirectStandardOutput = true, RedirectStandardError = true, StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
      };
      psi.EnvironmentVariables["NFL_APP"] = "1";
      psi.EnvironmentVariables["PATH"] = App.NodeDir + ";" + (gitDir != null ? gitDir + ";" : "") + Environment.GetEnvironmentVariable("PATH");
      launcher = Process.Start(psi);
      launcher.ErrorDataReceived += (s, e) => { if (e.Data != null) App.LogLine("stderr: " + e.Data); };
      launcher.BeginErrorReadLine();
      string line;
      while ((line = launcher.StandardOutput.ReadLine()) != null) OnLine(line);
      launcher.WaitForExit();
      if (!quitting) Fail("The game stopped (code " + launcher.ExitCode + ").");
    } catch (Exception e) {
      App.LogLine(e.ToString());
      Fail(e.Message);
    }
  }

  void OnLine(string line) {
    if (!line.StartsWith("@@")) { var t = line.Trim(); if (t.Length > 0 && !t.StartsWith("---")) Detail(t); return; }
    var cmd = line.Substring(2);
    if (cmd.StartsWith("STEP ")) {
      var p = cmd.Substring(5).Split(new[] { '|' }, 2);
      int n; int.TryParse(p[0], out n);
      if (ready) { updating = true; Ui(() => { ShowReady(false); banner.Visible = alphaBanner.Visible = false; Relayout(); }); }
      Step(n, p.Length > 1 ? p[1] : "");
    } else if (cmd.StartsWith("READY ")) {
      var p = cmd.Substring(6).Split('|');
      if (p.Length > 1 && p[1].Length > 0) phoneUrl = p[1];
      // wait until the game server answers, then open it (once; after an in-game update the page is already open)
      for (int i = 0; i < 360 && !App.GameAlive(); i++) Thread.Sleep(500);
      App.LogLine("game answered: " + App.GameAlive());
      bool wasUpdate = updating;
      ready = true; updating = false;
      Ui(() => {
        pending = null; banner.Visible = false;
        RefreshVersion();
        ShowReady(true);
        checkTimer.Start();
        if (!openedOnce) {
          openedOnce = true;
          if (movedFromBat) {
            // they already play: put the app where they'll look for it, no question, and say so once
            App.Set("shortcuts-asked", "1");
            App.MakeShortcuts(this);
            App.LogLine("moved over from Install_and_Play: shortcuts made");
            tray.ShowBalloonTip(15000, "NFL History is now an app", "From now on, open NFL History from your desktop or Start menu. No more terminal window.", ToolTipIcon.Info);
          }
          if (!App.Background) { App.OpenGame(); if (!movedFromBat) App.OfferShortcuts(this); }
        }
        if (wasUpdate) tray.ShowBalloonTip(8000, "NFL History updated", "You're on v" + App.Version() + ". Start a new league to get every fix.", ToolTipIcon.Info);
        ShowWhatsNewIfUpdated();
        RefreshAlpha();
      });
    } else if (cmd.StartsWith("QR ")) {
      var rows = cmd.Substring(3).Split(',');
      Ui(() => { qr.Image = DrawQr(rows); if (ready) ShowReady(true); });
    } else if (cmd.StartsWith("UPDATE_FAILED ")) {
      var why = cmd.Substring(14);
      Ui(() => MessageBox.Show(this, "The update didn't work: " + why + "\n\nThe game keeps running on v" + App.Version() + ". It tries again the next time NFL History starts.", "NFL History", MessageBoxButtons.OK, MessageBoxIcon.Warning));
    } else if (cmd == "IDLE") {
      if (updating && App.GameAlive()) Ui(() => { updating = false; ready = true; RefreshVersion(); ShowReady(true); RefreshAlpha(); });
    } else if (cmd.StartsWith("FAIL ")) {
      App.LogLine("launcher failed: " + cmd.Substring(5));
    }
  }

  // After an update (at start or from the game), show what changed since the version this player last saw, once
  void ShowWhatsNewIfUpdated() {
    var v = App.Version(); var seen = App.Get("seen-version", "");
    App.Set("seen-version", v);
    if (seen == "" || seen == v) return; // first install, or nothing new
    var md = App.SectionsSince(App.Changelog(), App.Alpha() ? "" : seen, App.Alpha() ? 1 : 8);
    if (md == "") return;
    var f = new NotesForm("What's new", "What's new in v" + v, md, null, null);
    f.Show(this);
  }

  void ShowChangelog() {
    var md = App.SectionsSince(App.Changelog(), "", 60);
    if (md == "") { MessageBox.Show(this, "The changelog isn't in this folder yet. It comes with the next update.", "NFL History"); return; }
    new NotesForm("What's new", "Changelog", md, null, null).Show(this);
  }

  void ShowAbout() {
    MessageBox.Show(this, "NFL History for Football GM\nVersion " + App.Version() + (App.Alpha() ? " (Live Football alpha)" : "") +
      "\n\nEvery NFL season since 1966 in Football GM: real teams, players, logos and history.\nA fan-made mod, not connected to the NFL or Football GM.\n\nInstalled in:\n" + App.Root +
      "\n\nGitHub: " + App.REPO_URL, "About NFL History", MessageBoxButtons.OK, MessageBoxIcon.Information);
  }

  // ---------- updates ----------
  void CheckForUpdates(bool manual) {
    if (updating) { if (manual) MessageBox.Show(this, "An update is installing right now.", "NFL History"); return; }
    if (!manual && !App.On("notify", true)) return;
    new Thread(() => {
      var rel = App.Latest();
      Ui(() => {
        if (rel == null) { if (manual) MessageBox.Show(this, "Couldn't reach GitHub to check for updates. Check your internet and try again.", "NFL History", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
        if (!App.IsNewer(rel.Version, App.Version())) {
          if (manual) MessageBox.Show(this, "You're up to date (v" + App.Version() + ").", "NFL History", MessageBoxButtons.OK, MessageBoxIcon.Information);
          return;
        }
        pending = rel;
        bannerText.Text = "Update available: " + rel.Tag;
        banner.Visible = ready;
        Relayout();
        App.LogLine("update found: " + rel.Tag + (manual ? " (manual check)" : ""));
        if (manual) { BringBack(false); ShowPendingNotes(); }
        // the first time this run sees a version: a Windows notification, however it was found
        if (notified != rel.Tag) {
          notified = rel.Tag;
          tray.ShowBalloonTip(15000, "NFL History " + rel.Tag + " is out", FirstNote(rel.Notes) + "\nClick to see what's new and update.", ToolTipIcon.Info);
        }
      });
    }) { IsBackground = true }.Start();
  }

  static string FirstNote(string notes) {
    foreach (var l in notes.Replace("\r", "").Split('\n')) {
      var t = Regex.Replace(l, @"\[([^\]]+)\]\([^)]+\)", "$1").Replace("**", "").Trim();
      if (t.StartsWith("- ")) { t = t.Substring(2); return t.Length > 110 ? t.Substring(0, 107) + "..." : t; }
    }
    return "";
  }

  void ShowPendingNotes() {
    if (pending == null) return;
    var rel = pending;
    new NotesForm("Update available", "NFL History " + rel.Tag + " is out", "## " + rel.Tag + "\n" + rel.Notes, ready ? "Update now" : null, ready ? (Action)StartUpdate : null).Show(this);
  }

  void RefreshAlpha() {
    backLink.Visible = App.Alpha();
    if (App.Alpha()) { alphaOut = false; ShowAlphaBanner(); return; }
    new Thread(() => { var on = App.AlphaOut(); Ui(() => { alphaOut = on; ShowAlphaBanner(); }); }) { IsBackground = true }.Start();
  }
  void ShowAlphaBanner() { alphaBanner.Visible = alphaOut && ready && !updating && !App.Alpha(); Relayout(); }

  void Switch(string to) {
    if (!ready || updating) return;
    var code = App.AskLauncherToSwitch(to);
    App.LogLine("switch to " + to + ": " + code);
    if (code == 202) { updating = true; banner.Visible = alphaBanner.Visible = false; ShowReady(false); stepLabel.Text = to == "alpha" ? "Switching to the Live Football alpha..." : "Switching back to the regular mod..."; detailLabel.Visible = true; detailLabel.Text = "A few minutes the first time. The game restarts by itself and its page reloads when it's ready."; Relayout(); }
    else if (code == 409) MessageBox.Show(this, "An update is already installing.", "NFL History");
    else MessageBox.Show(this, "The switch couldn't start. Quit NFL History, open it again, and try once more.", "NFL History", MessageBoxButtons.OK, MessageBoxIcon.Warning);
  }

  void StartUpdate() {
    if (!ready || updating) return;
    var code = App.AskLauncherToUpdate();
    if (code == 202) { updating = true; banner.Visible = false; ShowReady(false); stepLabel.Text = "Updating..."; Relayout(); }
    else if (code == 409) MessageBox.Show(this, "An update is already installing.", "NFL History");
    else MessageBox.Show(this, "The update couldn't start. Quit NFL History and open it again: it updates when it starts.", "NFL History", MessageBoxButtons.OK, MessageBoxIcon.Warning);
  }

  // ---------- layout ----------
  void ShowReady(bool on) {
    bool phone = on && phoneUrl.Length > 0;
    if (on) stepLabel.Text = "The game is running";
    stepLabel.Width = phone ? 320 : 492;
    bar.Visible = detailLabel.Visible = !on;
    openBtn.Visible = on;
    phoneLabel.Text = phone ? "On your phone:\n" + phoneUrl : "";
    phoneLabel.Visible = phoneHelp.Visible = phone;
    qr.Visible = phone && qr.Image != null;
    Relayout();
  }

  void Relayout() {
    alphaBanner.Location = new Point(6, 86 + (banner.Visible ? 48 : 0));
    int top = 86 + (banner.Visible ? 48 : 0) + (alphaBanner.Visible ? 48 : 0);
    bool phone = phoneLabel.Visible;
    int y = failed ? 158 : !ready || updating ? 158 : phone ? 176 : 48;
    openBtn.Location = new Point(18, y); quitBtn.Location = new Point(failed ? 398 : 178, y);
    reportBtn.Location = new Point(18, y); copyBtn.Location = new Point(138, y); logBtn.Location = new Point(268, y);
    body.Location = new Point(6, top); body.Height = y + 42;
    footer.Location = new Point(6, body.Bottom + 4);
    ClientSize = new Size(540, footer.Bottom + 2);
  }

  void Fail(string msg) {
    Ui(() => {
      ready = false; failed = true; updating = false; checkTimer.Stop();
      stepLabel.Text = "Something went wrong";
      stepLabel.Width = 492;
      detailLabel.Visible = true;
      detailLabel.Text = msg + "\n\nOpen NFL History again first (it picks up where it stopped). Still failing? Click Report it and paste the details (Copy details puts them on your clipboard).";
      openBtn.Visible = phoneLabel.Visible = phoneHelp.Visible = qr.Visible = bar.Visible = banner.Visible = alphaBanner.Visible = false;
      reportBtn.Visible = copyBtn.Visible = logBtn.Visible = true;
      Relayout();
      BringBack(false);
      tray.ShowBalloonTip(8000, "NFL History stopped", msg, ToolTipIcon.Error);
    });
  }

  static Bitmap DrawQr(string[] rows) {
    int n = rows.Length, quiet = 3, scale = 6, size = (n + quiet * 2) * scale;
    var bmp = new Bitmap(size, size);
    using (var g = Graphics.FromImage(bmp)) {
      g.Clear(Color.White);
      for (int r = 0; r < n; r++) for (int c = 0; c < rows[r].Length; c++)
        if (rows[r][c] == '1') g.FillRectangle(Brushes.Black, (c + quiet) * scale, (r + quiet) * scale, scale, scale);
    }
    return bmp;
  }

  // ---------- closing: the X hides to the tray while the game runs; Quit stops it ----------
  protected override void OnFormClosing(FormClosingEventArgs e) {
    if (!quitting && e.CloseReason == CloseReason.UserClosing && ready && App.On("tray", true)) {
      e.Cancel = true; Hide();
      if (!trayHintShown) { trayHintShown = true; tray.ShowBalloonTip(6000, "NFL History is still running", "The game keeps going. Right-click the football down here to open it or quit.", ToolTipIcon.Info); }
      return;
    }
    if (!quitting && !Quit(e.CloseReason == CloseReason.UserClosing)) { e.Cancel = true; return; }
    base.OnFormClosing(e);
  }

  bool Quit(bool ask) {
    if (quitting) return true;
    bool running = launcher != null && !SafeExited(launcher);
    if (running && ask) {
      BringBack(false);
      if (MessageBox.Show(this, "Quit NFL History? The game stops (your leagues are saved).", "NFL History", MessageBoxButtons.OKCancel, MessageBoxIcon.Question) != DialogResult.OK) return false;
    }
    quitting = true;
    checkTimer.Stop();
    tray.Visible = false; tray.Dispose();
    App.KillTree(launcher);
    Application.Exit();
    return true;
  }
  static bool SafeExited(Process p) { try { return p.HasExited; } catch { return true; } }
}
