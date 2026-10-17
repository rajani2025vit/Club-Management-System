
import { useState, useEffect } from "react";
import {
  LayoutDashboard, Users, Building2, CalendarDays, UserPlus,
  Network, Search, Bell, ArrowUpRight, MapPin, Clock,
  ChevronRight, Plus, Sparkles, Menu, X
} from "lucide-react";
import "./App.css";

const nav = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Students", icon: Users },
  { name: "Clubs", icon: Building2 },
  { name: "Events", icon: CalendarDays },
  { name: "Recruitment", icon: UserPlus },
  { name: "Graph Explorer", icon: Network }
];


const API = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const apiFetch = (url, options = {}) => fetch(url.startsWith("/api/") ? `${API}${url}` : url, { ...options, credentials: "include" });

function AuthScreen({ onLogin }) {
  const [signup, setSignup] = useState(false);
  const [form, setForm] = useState({ registrationNo: "", password: "", name: "", email: "", department: "CSE", year: "2" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const res = await apiFetch(`${API}/api/auth/${signup ? "signup" : "login"}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Authentication failed");
      onLogin(data);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <div style={{minHeight:"100vh",display:"grid",placeItems:"center",background:"#f5f2ff",padding:20}}>
    <form onSubmit={submit} style={{background:"white",borderRadius:20,padding:32,width:"100%",maxWidth:420,boxShadow:"0 12px 45px #28115c1c",display:"grid",gap:14}}>
      <h1 style={{color:"#6444c1",margin:0}}>clubhub.</h1>
      <h2 style={{margin:0}}>{signup ? "Create student account" : "Welcome back"}</h2>
      <label>Registration Number<input required value={form.registrationNo} onChange={e=>update("registrationNo",e.target.value.toUpperCase())} placeholder="25BCE1657" style={{width:"100%",padding:11,marginTop:5}}/></label>
      {signup && <>
        <label>Full Name<input required value={form.name} onChange={e=>update("name",e.target.value)} style={{width:"100%",padding:11,marginTop:5}}/></label>
        <label>Email<input required type="email" value={form.email} onChange={e=>update("email",e.target.value)} style={{width:"100%",padding:11,marginTop:5}}/></label>
        <label>Department<input required value={form.department} onChange={e=>update("department",e.target.value)} style={{width:"100%",padding:11,marginTop:5}}/></label>
        <label>Year<select value={form.year} onChange={e=>update("year",e.target.value)} style={{width:"100%",padding:11,marginTop:5}}>{[1,2,3,4].map(y=><option key={y} value={y}>Year {y}</option>)}</select></label>
      </>}
      <label>Password<input required type="password" minLength={signup ? 8 : 1} value={form.password} onChange={e=>update("password",e.target.value)} style={{width:"100%",padding:11,marginTop:5}}/></label>
      {error && <p style={{color:"#b42318",margin:0}}>{error}</p>}
      <button className="primary-btn" disabled={busy} type="submit">{busy ? "Please wait..." : signup ? "Sign up" : "Login"}</button>
      <button type="button" className="secondary-btn" onClick={()=>{setSignup(!signup);setError("");}}>{signup ? "Already have an account? Login" : "New here? Sign up"}</button>
    </form>
  </div>;
}

function App() {
  const [auth, setAuth] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  useEffect(() => {
    apiFetch(`${API}/api/auth/me`).then(r => r.ok ? r.json() : null).then(setAuth).catch(()=>setAuth(null)).finally(()=>setAuthLoading(false));
  }, []);
  const isAdmin = auth?.role === "admin";
  const isManager = auth?.role === "admin" || auth?.role === "club_lead";
  const userInitials = (auth?.name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join("") || "U";
  const logout = async () => { await apiFetch(`${API}/api/auth/logout`, {method:"POST"}); setAuth(null); };
  const [managedClubIds, setManagedClubIds] = useState([]);
  const [managedClubsLoading, setManagedClubsLoading] = useState(true);
  useEffect(() => {
    if (!auth) { setManagedClubIds([]); setManagedClubsLoading(false); return; }
    let active = true;
    setManagedClubsLoading(true);
    apiFetch(`${API}/api/auth/managed-clubs`)
      .then(async r => { if (!r.ok) throw new Error("Unable to load club permissions"); return r.json(); })
      .then(data => { if (active) setManagedClubIds(Array.isArray(data.clubIds) ? data.clubIds : []); })
      .catch(err => { console.error(err); if (active) setManagedClubIds([]); })
      .finally(() => { if (active) setManagedClubsLoading(false); });
    return () => { active = false; };
  }, [auth]);
  const canManageClub = (clubName) => isAdmin || (
    auth?.role === "club_lead" && !managedClubsLoading &&
    clubs.some(c => c.name === clubName && managedClubIds.includes(c.clubId))
  );


  const [page, setPage] = useState("Overview");
  const [actionStudent, setActionStudent] = useState("");
  useEffect(() => { if (auth) setActionStudent(auth.registrationNo); }, [auth]);
  const [relationshipSaving, setRelationshipSaving] = useState(false);
  const [students, setStudents] = useState([]);

  const formatStudent = (s, index = 0) => ({
    name: s.name,
    id: s.registrationNo,
    email: s.email || "",
    dept: s.department,
    year: `Year ${s.year}`,
    clubs: s.clubs || 0,
    color: ["#f7d9c4", "#d9e5ff", "#d9f3e4", "#f3d9f7"][index % 4]
  });

  const loadStudents = async () => {
    const response = await apiFetch(`${API}/api/students`);
    if (!response.ok) throw new Error("Unable to load students");
    const data = await response.json();
    setStudents(data.map(formatStudent));
  };

  useEffect(() => {
    if (auth) loadStudents().catch((error) => console.error(error));
  }, [auth]);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [studentSaving, setStudentSaving] = useState(false);
  const [studentForm, setStudentForm] = useState({
    name: "", id: "", email: "", dept: "Computer Engineering", year: "Year 1"
  });
  const [query, setQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [drives, setDrives] = useState([]);
  const [applicationSaving, setApplicationSaving] = useState(false);
  const [showRecruitmentForm, setShowRecruitmentForm] = useState(false);
  const [editingRecruitment, setEditingRecruitment] = useState(null);
  const [recruitmentSaving, setRecruitmentSaving] = useState(false);
  const blankRecruitment = { recruitmentId: "", recruitmentTitle: "", clubId: "", team: "Technical", eligibility: "All Students", startDate: "", endDate: "" };
  const [recruitmentForm, setRecruitmentForm] = useState(blankRecruitment);
  const loadRecruitments = async () => {
    const response = await apiFetch(`${API}/api/recruitments`);
    if (!response.ok) throw new Error("Unable to load recruitments");
    const data = await response.json();
    setDrives(data.map((r, i) => ({
      ...r, club: r.clubName || "Unassigned club",
      role: r.title || r.recruitmentTitle || "Recruitment drive",
      deadline: r.deadline ? String(r.deadline).slice(0, 10) : "Not specified",
      applicants: r.applicants ?? 0, status: r.status || "Status unknown",
      color: ["#eee8ff", "#e0f3ff", "#ffe9d9"][i % 3]
    })));
  };
  const openRecruitmentForm = (drive = null) => {
    setEditingRecruitment(drive);
    setRecruitmentForm(drive ? {
      recruitmentId: drive.recruitmentId,
      recruitmentTitle: drive.recruitmentTitle || drive.title || "",
      clubId: clubs.find(c => c.name === drive.club)?.clubId || "",
      team: drive.team || "Technical", eligibility: drive.eligibility || "All Students",
      startDate: String(drive.startDate || "").slice(0, 10),
      endDate: String(drive.endDate || drive.deadline || "").slice(0, 10)
    } : { ...blankRecruitment, clubId: allowedClubs[0]?.clubId || "" });
    setShowRecruitmentForm(true);
  };
  const saveRecruitment = async (event) => {
    event.preventDefault();
    setRecruitmentSaving(true);
    try {
      const url = editingRecruitment
        ? `${API}/api/recruitments/${encodeURIComponent(editingRecruitment.recruitmentId)}`
        : `${API}/api/recruitments`;
      const response = await apiFetch(url, {
        method: editingRecruitment ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recruitmentForm)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save recruitment");
      await loadRecruitments();
      const graphResponse = await apiFetch(`${API}/api/graph`);
      if (graphResponse.ok) setGraphData(await graphResponse.json());
      setShowRecruitmentForm(false);
      setEditingRecruitment(null);
      notify(editingRecruitment ? "Recruitment updated!" : "Recruitment created!");
    } catch (error) { window.alert(error.message); }
    finally { setRecruitmentSaving(false); }
  };
  const deleteRecruitment = async (drive) => {
    if (!window.confirm(`Delete ${drive.role}? Recruitments with applications cannot be deleted.`)) return;
    try {
      const response = await apiFetch(`${API}/api/recruitments/${encodeURIComponent(drive.recruitmentId)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not delete recruitment");
      await loadRecruitments();
      const graphResponse = await apiFetch(`${API}/api/graph`);
      if (graphResponse.ok) setGraphData(await graphResponse.json());
      notify("Recruitment deleted!");
    } catch (error) { window.alert(error.message); }
  };

  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [apiErrors, setApiErrors] = useState([]);

  useEffect(() => {
    const fetchJson = async (url) => {
      const response = await apiFetch(`${API}${url}`);
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return response.json();
    };
    if (!auth) return;
    if (!auth) return;
    fetchJson('/api/recruitments').then((data) => {
      const colors = ['#eee8ff', '#e0f3ff', '#ffe9d9'];
      setDrives(data.map((r, i) => ({
        ...r,
        club: r.clubName || 'Unassigned club',
        role: r.title || r.recruitmentTitle || r.recruitmentName || 'Recruitment drive',
        deadline: r.deadline ? String(r.deadline).slice(0, 10) : 'Not specified',
        applicants: r.applicants ?? null,
        status: r.status || 'Status unknown',
        color: colors[i % colors.length]
      })));
    }).catch((e) => { console.error(e); setApiErrors(v => [...v, e.message]); });
    fetchJson('/api/graph').then(setGraphData)
      .catch((e) => { console.error(e); setApiErrors(v => [...v, e.message]); });
  }, [auth]);

  const graphNodes = graphData.nodes.map((node, index, all) => {
    const angle = (2 * Math.PI * index) / Math.max(all.length, 1) - Math.PI / 2;
    const radius = all.length > 10 ? 145 : 120;
    return { ...node, x: 350 + Math.cos(angle) * radius * 2, y: 190 + Math.sin(angle) * radius };
  });
  const graphById = Object.fromEntries(graphNodes.map((n) => [n.id, n]));
  const [eventsList, setEventsList] = useState([]);

  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [eventSaving, setEventSaving] = useState(false);
  const blankEvent = { eventId: "", eventName: "", clubId: "", eventDate: "", eventType: "Workshop", venue: "", mode: "Offline", budget: "0" };
  const [eventForm, setEventForm] = useState(blankEvent);
  const loadEvents = async () => {
    const response = await apiFetch(`${API}/api/events`);
    if (!response.ok) throw new Error("Unable to load events");
    const data = await response.json();
    const icons = ["⚡", "🤖", "✍️"];
    const colors = ["#eee8ff", "#e0f3ff", "#ffe9d9"];
    setEventsList(data.map((event, index) => ({
      eventId: event.eventId,
      title: event.eventName || "Untitled event",
      club: event.clubName || "Club not assigned",
      date: event.eventDate ? new Date(String(event.eventDate).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Date TBA",
      rawDate: event.eventDate ? String(event.eventDate).slice(0, 10) : "",
      time: event.mode ? `Mode: ${event.mode}` : "Mode not specified",
      mode: event.mode || "Offline",
      place: event.venue || "Venue TBA",
      type: event.eventType,
      budget: event.budget,
      attendees: event.attendees || 0,
      emoji: icons[index % icons.length],
      color: colors[index % colors.length]
    })));
  };
  useEffect(() => { if (auth) loadEvents().catch(console.error); }, [auth]);
  const openEventForm = (event = null) => {
    setEditingEvent(event);
    setEventForm(event ? {
      eventId: event.eventId, eventName: event.title,
      clubId: clubs.find(c => c.name === event.club)?.clubId || "",
      eventDate: event.rawDate, eventType: event.type || "Workshop",
      venue: event.place || "", mode: event.mode || "Offline",
      budget: String(event.budget ?? 0)
    } : { ...blankEvent, clubId: allowedClubs[0]?.clubId || "" });
    setShowEventForm(true);
  };
  const saveEvent = async (e) => {
    e.preventDefault(); setEventSaving(true);
    try {
      const url = editingEvent ? `/api/events/${encodeURIComponent(editingEvent.eventId)}` : `${API}/api/events`;
      const response = await apiFetch(url, { method: editingEvent ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...eventForm, budget: Number(eventForm.budget) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save event");
      await loadEvents();
      const graphResponse = await apiFetch(`${API}/api/graph`);
      if (graphResponse.ok) setGraphData(await graphResponse.json());
      setShowEventForm(false); setEditingEvent(null);
      notify(editingEvent ? "Event updated!" : "Event created!");
    } catch (error) { window.alert(error.message); }
    finally { setEventSaving(false); }
  };
  const deleteEvent = async (event) => {
    if (!window.confirm(`Delete ${event.title}? Events with registrations cannot be deleted.`)) return;
    try {
      const response = await apiFetch(`${API}/api/events/${encodeURIComponent(event.eventId)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not delete event");
      await loadEvents();
      const graphResponse = await apiFetch(`${API}/api/graph`);
      if (graphResponse.ok) setGraphData(await graphResponse.json());
      notify("Event deleted!");
    } catch (error) { window.alert(error.message); }
  };

const [clubs, setClubs] = useState([]);
  const allowedClubs = isAdmin ? clubs : clubs.filter(c => managedClubIds.includes(c.clubId));
const [showClubForm, setShowClubForm] = useState(false);
const [editingClub, setEditingClub] = useState(null);
const [clubSaving, setClubSaving] = useState(false);
const [clubForm, setClubForm] = useState({ clubId: "", name: "", category: "Technical", establishedYear: "2026" });
const resetClubForm = () => {
  setEditingClub(null);
  setClubForm({ clubId: "", name: "", category: "Technical", establishedYear: "2026" });
};
const loadClubs = async () => {
  const response = await apiFetch(`${API}/api/clubs`);
  if (!response.ok) throw new Error("Unable to load clubs");
  const data = await response.json();
  const emojis = { C001: "💻", C002: "🤖", C003: "📚" };
  const colors = { C001: "#eee8ff", C002: "#e0f3ff", C003: "#ffe9d9" };
  setClubs(data.map(club => ({ ...club,
    type: (club.category || "Student Club").toUpperCase(),
    emoji: emojis[club.clubId] || "🌟",
    color: colors[club.clubId] || "#e2f6e9",
    desc: `Established in ${club.establishedYear}`
  })));
};
const editClub = (club) => {
  setSelectedClub(null);
  setEditingClub(club);
  setClubForm({ clubId: club.clubId, name: club.name, category: club.category || "Technical", establishedYear: String(club.establishedYear || 2026) });
  setShowClubForm(true);
};
const saveClub = async (e) => {
  e.preventDefault();
  setClubSaving(true);
  try {
    const editing = Boolean(editingClub);
    const url = editing
      ? `${API}/api/clubs/${encodeURIComponent(editingClub.clubId)}`
      : `${API}/api/clubs`;
    const response = await apiFetch(url, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...clubForm, clubId: clubForm.clubId.trim().toUpperCase(), establishedYear: Number(clubForm.establishedYear) })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not save club");
    await refreshRelationships();
    setShowClubForm(false);
    resetClubForm();
    notify(editing ? "Club updated in Neo4j!" : "Club created in Neo4j!");
  } catch (error) { window.alert(error.message); }
  finally { setClubSaving(false); }
};
const deleteClub = async (club) => {
  if (!window.confirm(`Delete ${club.name}? Clubs with relationships cannot be deleted.`)) return;
  try {
    const response = await apiFetch(`${API}/api/clubs/${encodeURIComponent(club.clubId)}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not delete club");
    await refreshRelationships();
    setSelectedClub(null);
    notify("Club deleted from Neo4j!");
  } catch (error) { window.alert(error.message); }
};

useEffect(() => { if (auth) loadClubs().catch(error => console.error("Error loading clubs:", error)); }, [auth]);
const [selectedClub, setSelectedClub] = useState(null);
const [selectedStudent, setSelectedStudent] = useState(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState("");


  const notify = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 2500);
  };

  const filteredStudents = students.filter((s) =>
    (s.name + " " + s.id + " " + s.dept)
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  const filteredClubs = clubs.filter((c) =>
    (c.name + " " + c.type)
      .toLowerCase()
      .includes(query.toLowerCase())
  );

const searchResults = query.trim()
  ? [
      ...students
        .filter((s) =>
          (s.name + " " + s.id + " " + s.dept)
            .toLowerCase()
            .includes(query.toLowerCase())
        )
        .map((s) => ({
          title: s.name,
          subtitle: "Student · " + s.id,
          page: "Students",
        })),
      ...clubs
        .filter((c) =>
          (c.name + " " + c.type)
            .toLowerCase()
            .includes(query.toLowerCase())
        )
        .map((c) => ({
          title: c.name,
          subtitle: "Club · " + c.type,
          page: "Clubs",
        })),
      ...eventsList
        .filter((e) =>
          (e.title + " " + e.club + " " + e.place)
            .toLowerCase()
            .includes(query.toLowerCase())
        )
        .map((e) => ({
          title: e.title,
          subtitle: "Event · " + e.club,
          page: "Events",
        })),
      ...drives
        .filter((d) =>
          (d.club + " " + d.role)
            .toLowerCase()
            .includes(query.toLowerCase())
        )
        .map((d) => ({
          title: d.club,
          subtitle: "Recruitment · " + d.role,
          page: "Recruitment",
        })),
    ]
  : [];

  
const refreshRelationships = async () => {
  await loadStudents();
  const [clubsResponse, eventsResponse, graphResponse] = await Promise.all([
    apiFetch(`${API}/api/clubs`),
    apiFetch(`${API}/api/events`),
    apiFetch(`${API}/api/graph`)
  ]);
  if (!clubsResponse.ok || !eventsResponse.ok || !graphResponse.ok) {
    throw new Error("Could not refresh relationship data");
  }
  const [clubRows, eventRows, graphRows] = await Promise.all([
    clubsResponse.json(), eventsResponse.json(), graphResponse.json()
  ]);
  setClubs(clubRows.map((club) => ({
    ...club,
    type: (club.category || "Student Club").toUpperCase(),
    emoji: ({ C001: "💻", C002: "🤖", C003: "📚" })[club.clubId] || "🌟",
    color: ({ C001: "#eee8ff", C002: "#e0f3ff", C003: "#ffe9d9" })[club.clubId] || "#e2f6e9",
    desc: `Established in ${club.establishedYear}`
  })));
  setEventsList(eventRows.map((event, index) => ({
    eventId: event.eventId,
    title: event.eventName || "Untitled event",
    club: event.clubName || "Club not assigned",
    date: event.eventDate ? new Date(event.eventDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Date TBA",
    rawDate: event.eventDate,
    time: event.mode ? `Mode: ${event.mode}` : "Mode not specified",
    place: event.venue || "Venue TBA",
    type: event.eventType,
    budget: event.budget,
    attendees: event.attendees ?? 0,
    emoji: ["⚡", "🤖", "✍️"][index % 3],
    color: ["#eee8ff", "#e0f3ff", "#ffe9d9"][index % 3]
  })));
  setGraphData(graphRows);
};

const saveRelationship = async (endpoint, payload) => {
  if (!actionStudent) {
    window.alert("Select a student first.");
    return;
  }
  setRelationshipSaving(true);
  try {
    const response = await apiFetch(`${API}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationNo: actionStudent, ...payload })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not save relationship");
    await refreshRelationships();
    setSelectedClub(null);
    notify("Relationship saved in Neo4j!");
  } catch (error) {
    window.alert(error.message);
  } finally {
    setRelationshipSaving(false);
  }
};


  const applyToDrive = async (drive) => {
    if (!actionStudent) return window.alert("Please select a student first.");
    if (!drive.recruitmentId) return window.alert("Recruitment ID is missing in Neo4j.");
    setApplicationSaving(true);
    try {
      const response = await apiFetch(`${API}/api/recruitment-applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationNo: actionStudent, recruitmentId: drive.recruitmentId })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Application failed");
      const [recruitmentsResponse, graphResponse] = await Promise.all([
        apiFetch(`${API}/api/recruitments`),
        apiFetch(`${API}/api/graph`)
      ]);
      if (!recruitmentsResponse.ok || !graphResponse.ok) throw new Error("Application saved, but refresh failed");
      const [recruitments, graph] = await Promise.all([recruitmentsResponse.json(), graphResponse.json()]);
      setDrives(recruitments.map((r, i) => ({
        ...r,
        club: r.clubName || "Unassigned club",
        role: r.title || r.recruitmentTitle || r.recruitmentName || "Recruitment drive",
        deadline: r.deadline ? String(r.deadline).slice(0, 10) : "Not specified",
        applicants: r.applicants ?? 0,
        status: r.status || "Status unknown",
        color: ["#eee8ff", "#e0f3ff", "#ffe9d9"][i % 3]
      })));
      setGraphData(graph);
      notify("Application saved in Neo4j!");
    } catch (error) {
      window.alert(error.message);
    } finally {
      setApplicationSaving(false);
    }
  };

  const saveStudent = async (e) => {
    e.preventDefault();
    const id = studentForm.id.trim().toUpperCase();
    const payload = {
      registrationNo: id,
      name: studentForm.name.trim(),
      email: studentForm.email.trim(),
      department: studentForm.dept,
      year: Number(studentForm.year.replace("Year ", ""))
    };
    setStudentSaving(true);
    try {
      const editing = Boolean(editingStudent);
      const url = editing
        ? `${API}/api/students/${encodeURIComponent(editingStudent.id)}`
        : `${API}/api/students`;
      const response = await apiFetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to save student");
      await loadStudents();
      setShowAddStudent(false);
      setEditingStudent(null);
      setSelectedStudent(null);
      setStudentForm({ name: "", id: "", email: "", dept: "Computer Engineering", year: "Year 1" });
      notify(editing ? "Student updated in Neo4j!" : "Student added to Neo4j!");
    } catch (error) {
      window.alert(error.message);
    } finally {
      setStudentSaving(false);
    }
  };

  const editStudent = (student) => {
    setSelectedStudent(null);
    setEditingStudent(student);
    setStudentForm({ name: student.name, id: student.id, email: student.email,
      dept: student.dept, year: student.year });
    setShowAddStudent(true);
  };

  const deleteStudent = async (student) => {
    if (!window.confirm(`Delete ${student.name} (${student.id})? This also removes their Neo4j relationships.`)) return;
    try {
      const response = await apiFetch(
        `${API}/api/students/${encodeURIComponent(student.id)}`,
        { method: "DELETE" }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to delete student");
      await loadStudents();
      setSelectedStudent(null);
      notify("Student deleted from Neo4j!");
    } catch (error) {
      window.alert(error.message);
    }
  };

  const pageDescriptions = {
    Overview: "Here's what's happening in your campus community.",
    Students: "Meet the people who make campus life happen.",
    Clubs: "Find your people. Discover your community.",
    Events: "Make plans. Show up. Make memories.",
    Recruitment: "Find your next team, your next opportunity.",
    "Graph Explorer": "Explore how students, clubs and events connect."
  };

  if (authLoading) return <div style={{padding:40}}>Loading ClubHub...</div>;
  if (!auth) return <AuthScreen onLogin={setAuth} />;

  return (
    <div className="app-shell">
      {mobileNav && <div className="mobile-overlay" onClick={() => setMobileNav(false)} />}

      <aside className={"sidebar " + (mobileNav ? "sidebar-open" : "")}>
        <div className="brand">
          <div className="brand-mark"><Sparkles size={22} /></div>
          <div><strong>clubhub<span>.</span></strong><small>CAMPUS, CONNECTED.</small></div>
          <button className="icon-btn mobile-close" onClick={() => setMobileNav(false)}><X /></button>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace">
          <div className="workspace-avatar">U</div>
          <div><strong>University Campus</strong><small>Student community</small></div>
          <ChevronRight size={16} />
        </div>

        <div className="nav-label">MENU</div>
        <nav className="nav-list">
          {nav.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={"nav-item " + (page === name ? "active" : "")}
              onClick={() => {
                setPage(name);
                setQuery("");
                setMobileNav(false);
              }}
            >
              <Icon size={19} />
              <span>{name}</span>
              {name === "Recruitment" && <span className="nav-count">{drives.length}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon"><Sparkles size={18} /></div>
            <strong>Campus life, simplified.</strong>
            <p>Everything happening on campus, all in one place.</p>
          </div>
          <div className="profile-row">
            <div className="profile-avatar">{userInitials}</div>
            <div><strong>{auth.name}</strong><small>{auth.role} · {auth.registrationNo}</small></div>
            <button className="secondary-btn" onClick={logout}>Logout</button>
            <span className="online-dot" />
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={() => setMobileNav(true)}><Menu /></button>
          <div className="breadcrumb">Workspace <ChevronRight size={14} /> <strong>{page}</strong></div>
          <div className="top-actions">
    
<div className="search-wrapper">
  <label className="search-box">
    <Search size={17} />
    <input
      value={query}
      onChange={(e) => {
        setQuery(e.target.value);
        setShowSearchResults(true);
      }}
      onFocus={() => setShowSearchResults(true)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setQuery("");
          setShowSearchResults(false);
        }
      }}
      placeholder="Search anything..."
    />
    {query && (
      <button
        type="button"
        className="search-clear"
        onClick={() => {
          setQuery("");
          setShowSearchResults(false);
        }}
      >
        ×
      </button>
    )}
  </label>

  {showSearchResults && query.trim() && (
    <div className="search-dropdown">
      <div className="search-dropdown-heading">
        SEARCH RESULTS · {searchResults.length}
      </div>

      {searchResults.length > 0 ? (
        searchResults.slice(0, 8).map((result, index) => (
          <button
            className="search-result"
            key={result.page + result.title + index}
            onClick={() => {
              setPage(result.page);
              setQuery("");
              setShowSearchResults(false);
            }}
          >
            <span>
              <strong>{result.title}</strong>
              <small>{result.subtitle}</small>
            </span>
            <ArrowUpRight size={15} />
          </button>
        ))
      ) : (
        <div className="search-empty">No matching results found.</div>
      )}
    </div>
  )}
</div>
            <button className="icon-btn notification-btn" onClick={() => notify("You're all caught up!")}><Bell size={19} /><i /></button>
            <div className="top-user">
  <span className="top-user-name">{auth?.name || "User"}</span>
  <div className="top-avatar">{userInitials}</div>
</div>
          </div>
        </header>

        <div className="page-content">
          <div className="welcome-row">
            <div>
              <div className="eyebrow"><span /> YOUR CAMPUS, YOUR COMMUNITY</div>
              <h1>{page === "Overview" ? "Welcome to ClubHub" : page} <span className="heading-sparkle">{page === "Overview" ? "✳" : ""}</span></h1>
              <p>{pageDescriptions[page]}</p>
            </div>
            
          </div>

          {page === "Overview" && (
            <>
              <div className="hero-banner">
                <div className="hero-copy">
                  <div className="hero-pill"><Sparkles size={13} /> THE CAMPUS EDIT</div>
                  <h2>Find your thing.<br /><span>Find your people.</span></h2>
                  <p>Great things happen when you get involved.</p>
                  <button onClick={() => setPage("Clubs")} className="hero-btn">Explore clubs <ArrowUpRight size={17} /></button>
                </div>
                <div className="hero-art">
                  <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
                  <div className="art-center">🎓</div>
                  <div className="art-float float-one">🎨</div><div className="art-float float-two">💻</div>
                  <div className="art-float float-three">🎤</div><div className="art-float float-four">⚡</div>
                  <div className="art-spark">✳</div>
                </div>
              </div>

              <div className="section-heading">
                <div><h2>Your campus at a glance</h2><p>A little snapshot of what's going on.</p></div>
                <span className="live-label"><i /> LIVE OVERVIEW</span>
              </div>

              <div className="stats-grid">
                <div className="stat-card lavender">
                  <div className="stat-top"><span>Total students</span><span className="stat-icon"><Users size={19} /></span></div>
                  <strong>{students.length}</strong><div className="stat-foot">Records in Neo4j</div>
<div className="mini-bars">{[35,55,40,72,50,85,62,95].map((h,i)=><i key={i} style={{height: h + "%"}} />)}</div>                </div>
                <div className="stat-card peach">
                  <div className="stat-top"><span>Active clubs</span><span className="stat-icon"><Building2 size={19} /></span></div>
                  <strong>{clubs.length}</strong><div className="stat-foot">Clubs in Neo4j</div><div className="stat-emoji">✦</div>
                </div>
                <div className="stat-card mint">
                  <div className="stat-top"><span>Upcoming events</span><span className="stat-icon"><CalendarDays size={19} /></span></div>
                  <strong>{eventsList.length}</strong><div className="stat-foot">Next up: <b>{eventsList[0]?.date || "TBA"}</b></div><div className="stat-emoji">✿</div>
                </div>
                <div className="stat-card blue">
                  <div className="stat-top"><span>Open recruitment</span><span className="stat-icon"><UserPlus size={19} /></span></div>
                  <strong>{drives.length}</strong><div className="stat-foot">Recruitment records in Neo4j</div><div className="stat-emoji">✦</div>
                </div>
                <div className="stat-card lavender">
                  <div className="stat-top"><span>Total Memberships</span><span className="stat-icon"><Users size={19} /></span></div>
                  <strong>{students.reduce((sum, student) => sum + (student.clubs || 0), 0)}</strong>
                  <div className="stat-foot">Student-club relationships</div>
                  <div className="stat-emoji">✦</div>
                </div>
              </div>

              <div className="dashboard-grid">
                <section className="panel events-panel">
                  <div className="panel-heading">
                    <div><h3>Coming up <span className="heading-emoji">✳</span></h3><p>Things worth showing up for.</p></div>
                    <button className="text-btn" onClick={() => setPage("Events")}>All events <ArrowUpRight size={15} /></button>
                  </div>
                  <div className="event-list">
                    { eventsList.map((event) =>(
                      <div className="event-row" key={event.title}>
                        <div className="event-emoji" style={{background:event.color}}>{event.emoji}</div>
                        <div className="event-info">
                          <strong>{event.title}</strong><small>{event.club}</small>
                          <div className="event-meta">
                            <span><CalendarDays size={13}/>{event.time}</span>
                            <span><MapPin size={13}/>{event.place}</span>
                          </div>
                        </div>
                        <div className="event-date">{event.date}</div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="panel clubs-panel">
                  <div className="panel-heading">
                    <div><h3>Clubs to know <span className="heading-emoji">✳</span></h3><p>Your next favourite thing.</p></div>
                    <button className="text-btn" onClick={() => setPage("Clubs")}>Explore <ArrowUpRight size={15} /></button>
                  </div>
                  <div className="club-mini-list">
                    {clubs.slice(0,4).map((club) => (
                      <div className="club-mini" key={club.name}>
                        <div className="club-mini-icon" style={{background:club.color}}>{club.emoji}</div>
                        <div><strong>{club.name}</strong><small>{club.members} members · {club.type.toLowerCase()}</small></div>
                        <ChevronRight size={17}/>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="bottom-note"><Sparkles size={17}/><span><strong>Little reminder:</strong> the best college memories usually start with saying yes to something new.</span><span className="note-decoration">✳</span></div>
            </>
          )}

          {page === "Students" && (
            <section className="panel directory-panel">
              <div className="panel-heading">
                <div><h3>Student directory</h3><p>{filteredStudents.length} students shown · Search by name, ID or department.</p></div>
                <div className="directory-actions">
                  <span className="directory-total">{students.length} profiles</span>
                  {isAdmin && <button className="primary-btn" onClick={() => { setEditingStudent(null); setStudentForm({ name: "", id: "", email: "", dept: "Computer Engineering", year: "Year 1" }); setShowAddStudent(true); }}><Plus size={16} /> Add student</button>}
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>STUDENT</th><th>REGISTER NUMBER</th><th>DEPARTMENT</th><th>YEAR</th><th>CLUBS</th></tr></thead>
                  <tbody>
                    {filteredStudents.map((s) => (
                      <tr key={s.id}>
                        <td><div className="student-cell"><div className="student-avatar" style={{background:s.color}}>{s.name.split(" ").map(n=>n[0]).join("")}</div><strong>{s.name}</strong></div></td>

<td>{s.id}</td>
<td>{s.dept}</td>
<td>{s.year}</td>
<td>
  <span className="club-badge">{s.clubs} clubs</span>
  <button
    className="text-btn"
    onClick={() => setSelectedStudent(s)}
  >
    View Profile
  </button>
</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredStudents.length === 0 && <div className="empty-state">No students match your search.</div>}
              </div>
            </section>
          )}

          {page === "Clubs" && (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                {isAdmin && <button className="primary-btn" onClick={() => { resetClubForm(); setShowClubForm(true); }}><Plus size={16} /> Add club</button>}
              </div>
              <div className="club-grid">
                {filteredClubs.map((club) => (
                  <article className="club-card" key={club.name}>
                    <div className="club-card-top" style={{background:club.color}}>
                      <span className="club-big-emoji">{club.emoji}</span>
                      <span className="club-type">{club.type}</span>
                      <button className="club-more" onClick={() => notify(club.name + " · " + club.members + " members")}>•••</button>
                      <span className="club-decoration">✳</span>
                    </div>
                    <div className="club-card-body">
                      <h3>{club.name}</h3><p>{club.desc}</p>
                      <div className="club-card-footer">
                        <span><Users size={15}/>{club.members} members</span>
                        <button onClick={() => setSelectedClub(club)}>View club <ArrowUpRight size={15}/></button>                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {filteredClubs.length === 0 && <div className="empty-state">No clubs match your search.</div>}
            </>
          )}

          {(page === "Events" || page === "Clubs") && (
            <div className="panel" style={{ padding: 16, marginBottom: 18 }}>
              <label htmlFor="action-student" style={{ marginRight: 12, fontWeight: 600 }}>Acting as student:</label>
              <strong>{auth?.name} ({auth?.registrationNo})</strong>
              <p style={{ marginTop: 8, fontSize: 12 }}>You are acting as your logged-in account.</p>
            </div>
          )}

          {page === "Events" && (
            <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
              {isManager && !managedClubsLoading && allowedClubs.length > 0 && <button className="primary-btn" onClick={() => openEventForm()}><Plus size={16}/> Add Event</button>}
            </div>
            <div className="event-page-grid">
              {eventsList.map((event) => (
                <article className="event-card" key={event.title}>
                  <div className="event-card-banner" style={{background:event.color}}><span>{event.emoji}</span><span className="event-card-date">{event.date}</span></div>
                  <div className="event-card-body">
                    <span className="club-type">{event.club}</span><h3>{event.title}</h3>
                    <p><CalendarDays size={15}/>{event.time}</p><p><MapPin size={15}/>{event.place}</p>
                    <div style={{display:"flex", gap:8, marginBottom:10}}>
                      {canManageClub(event.club) && <button className="secondary-btn" onClick={() => openEventForm(event)}>Edit</button>}
                      {canManageClub(event.club) && <button className="secondary-btn" onClick={() => deleteEvent(event)}>Delete</button>}
                    </div>
                    <button className="primary-btn event-register" disabled={relationshipSaving || !actionStudent} onClick={() => saveRelationship("/api/event-registrations", { eventId: event.eventId })}>
                      {relationshipSaving ? "Saving..." : "Register for event"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
            </>
          )}

          {page === "Recruitment" && (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
                {isManager && !managedClubsLoading && allowedClubs.length > 0 && <button className="primary-btn" onClick={() => openRecruitmentForm()}><Plus size={16}/> Add Recruitment</button>}
              </div>
              <div className="panel" style={{ padding: 16, marginBottom: 18 }}>
                <label htmlFor="recruitment-student" style={{ marginRight: 12, fontWeight: 600 }}>Acting as student:</label>
                <strong>{auth?.name} ({auth?.registrationNo})</strong>
                <p style={{ marginTop: 8, fontSize: 12 }}>You are acting as your logged-in account.</p>
              </div>
              <div className="recruitment-grid">
              {drives.map((drive) => (
                <article className="panel drive-card" key={drive.recruitmentId || drive.club + drive.role}>
                  <div className="drive-top"><span className="drive-icon" style={{background:drive.color}}>✳</span><span className="open-badge"><i/> {drive.status}</span></div>
                  <h3>{drive.club}</h3><p>{drive.role}</p>
                  <p style={{fontSize:12}}>Starts: {drive.startDate || "Not specified"} · Team: {drive.team || "—"}</p>
                  <div style={{display:"flex", gap:8, marginBottom:10}}>
                    {canManageClub(drive.club) && <button className="secondary-btn" onClick={() => openRecruitmentForm(drive)}>Edit</button>}
                    {canManageClub(drive.club) && <button className="secondary-btn" onClick={() => deleteRecruitment(drive)}>Delete</button>}
                  </div>
                  <div className="drive-stats"><span><Users size={15}/> {drive.applicants == null ? "Applicants not tracked" : `${drive.applicants} applicants`}</span><span><Clock size={15}/> Deadline {drive.deadline}</span></div>
<button
  className="primary-btn drive-apply"
  onClick={() => applyToDrive(drive)}
  disabled={applicationSaving || !actionStudent || !drive.recruitmentId}
>
  {applicationSaving ? "Applying..." : "Apply now"}
  <ArrowUpRight size={16} />
</button>                </article>
              ))}
            </div>
            </>
          )}

          {page === "Graph Explorer" && (
            <section className="panel graph-panel">
              <div className="panel-heading"><div><h3>Your campus, connected</h3><p>Live nodes and relationships retrieved from Neo4j.</p></div><span className="graph-label"><Network size={15}/> LIVE GRAPH</span></div>
              <div className="graph-canvas">
                <svg viewBox="0 0 700 390" role="img" aria-label="Neo4j campus graph">
                  <g stroke="#b9a6e9" strokeWidth="1.5" fill="none">
                    {graphData.links.map((edge, index) => {
                      const a = graphById[edge.source], b = graphById[edge.target];
                      return a && b ? <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> : null;
                    })}
                  </g>
                  {graphNodes.map((node) => (
                    <g key={node.id}>
                      <circle cx={node.x} cy={node.y} r="24" fill={node.label === 'Student' ? '#e5dcff' : node.label === 'Club' ? '#dff2ff' : node.label === 'Event' ? '#ffe8d8' : '#e2f6e9'} stroke="#7652e8" strokeWidth="1.5" />
                      <text x={node.x} y={node.y + 4} textAnchor="middle" fontSize="12">{node.label === 'Student' ? '🎓' : node.label === 'Club' ? '🏫' : node.label === 'Event' ? '📅' : '✳'}</text>
                      <text x={node.x} y={node.y + 39} textAnchor="middle" fontSize="10" fill="#4c4264">{node.name.length > 21 ? node.name.slice(0, 20) + '…' : node.name}</text>
                    </g>
                  ))}
                </svg>
              </div>
              {apiErrors.length > 0 && <p style={{ color: '#b42318' }}>{apiErrors.join('; ')}</p>}
              <p className="graph-disclaimer">{graphNodes.length} nodes · {graphData.links.length} relationships. Labels: {Array.from(new Set(graphData.links.map(e => e.type))).join(', ') || 'No relationships found'}.</p>
            </section>
          )}
        </div>
      </main>

{selectedStudent && (
  <div
    className="modal-backdrop"
    onClick={() => setSelectedStudent(null)}
  >
    <div
      className="modal"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="modal-close icon-btn"
        onClick={() => setSelectedStudent(null)}
      >
        <X />
      </button>

      <div
        className="student-avatar"
        style={{
          background: selectedStudent.color,
          width: 64,
          height: 64,
          fontSize: 22
        }}
      >
        {selectedStudent.name
          .split(" ")
          .map((n) => n[0])
          .join("")}
      </div>

      <h2>{selectedStudent.name}</h2>
      <p>{selectedStudent.dept}</p>

      <div className="drive-stats">
        <span>Register No: {selectedStudent.id}</span>
        <span>{selectedStudent.year}</span>
        <span>{selectedStudent.clubs} clubs joined</span>
        <span>{selectedStudent.email}</span>
      </div>

      <div className="modal-actions">
        {isAdmin && <button className="secondary-btn" onClick={() => editStudent(selectedStudent)}>Edit</button>}
        {isAdmin && <button className="secondary-btn" onClick={() => deleteStudent(selectedStudent)}>Delete</button>}
        <button
          className="primary-btn"
          onClick={() => setSelectedStudent(null)}
        >
          Close Profile
        </button>
      </div>
    </div>
  </div>
)}
     
{selectedClub && (
  <div
    className="modal-backdrop"
    onClick={() => setSelectedClub(null)}
  >
    <div
      className="modal club-details-modal"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="modal-close icon-btn"
        onClick={() => setSelectedClub(null)}
      >
        <X />
      </button>

      <div
        className="modal-icon"
        style={{ background: selectedClub.color }}
      >
        <span style={{ fontSize: 28 }}>
          {selectedClub.emoji}
        </span>
      </div>

      <span className="club-type">{selectedClub.type}</span>
      <h2>{selectedClub.name}</h2>
      <p>{selectedClub.desc}</p>

      <div className="drive-stats">
        <span>
          <Users size={16} />
          {selectedClub.members} members
        </span>
        <span>
          <CalendarDays size={16} />
          Campus activities
        </span>
      </div>

      <h3>About this club</h3>
      <p>
        Connect with students, participate in activities,
        learn new skills, and work together on exciting projects.
      </p>

      <h3>What you can do</h3>
      <p>Attend events, meet members, and take part in club activities.</p>

      <div className="modal-actions">
        <button
          className="secondary-btn"
          onClick={() => setSelectedClub(null)}
        >
          Close
        </button>

        {isAdmin && <button className="secondary-btn" onClick={() => editClub(selectedClub)}>Edit club</button>}
        {isAdmin && <button className="secondary-btn" onClick={() => deleteClub(selectedClub)}>Delete club</button>}
        <button
          className="primary-btn"
          disabled={relationshipSaving || !actionStudent}
          onClick={() => saveRelationship("/api/memberships", { clubId: selectedClub.clubId })}
        >
          {relationshipSaving ? "Saving..." : "Join club"}
        </button>
      </div>
    </div>
  </div>
)}

      {showEventForm && (
        <div className="modal-backdrop" onClick={() => setShowEventForm(false)}>
          <form className="modal" style={{maxHeight:"88vh",overflowY:"auto"}} onSubmit={saveEvent} onClick={e => e.stopPropagation()}>
            <button type="button" className="modal-close icon-btn" onClick={() => setShowEventForm(false)}><X /></button>
            <div className="modal-icon"><CalendarDays size={23}/></div>
            <h2>{editingEvent ? "Edit event" : "Add event"}</h2>
            <p>Save event details directly in Neo4j.</p>
            <label>Event ID<input required disabled={Boolean(editingEvent)} value={eventForm.eventId} onChange={e => setEventForm({...eventForm, eventId:e.target.value})} placeholder="e.g. E004" /></label>
            <label>Event name<input required value={eventForm.eventName} onChange={e => setEventForm({...eventForm, eventName:e.target.value})} /></label>
            <label>Organizing club<select required value={eventForm.clubId} onChange={e => setEventForm({...eventForm, clubId:e.target.value})}>
              <option value="">Select club</option>
              {allowedClubs.map(c => <option key={c.clubId} value={c.clubId}>{c.name}</option>)}
            </select></label>
            <label>Event date<input required type="date" value={eventForm.eventDate} onChange={e => setEventForm({...eventForm, eventDate:e.target.value})} /></label>
            <label>Event type<input required value={eventForm.eventType} onChange={e => setEventForm({...eventForm, eventType:e.target.value})} placeholder="Workshop / Competition" /></label>
            <label>Venue<input required value={eventForm.venue} onChange={e => setEventForm({...eventForm, venue:e.target.value})} /></label>
            <label>Mode<select required value={eventForm.mode} onChange={e => setEventForm({...eventForm, mode:e.target.value})}>
              <option value="Offline">Offline</option><option value="Online">Online</option><option value="Hybrid">Hybrid</option>
            </select></label>
            <label>Budget<input type="number" min="0" step="0.01" required value={eventForm.budget} onChange={e => setEventForm({...eventForm, budget:e.target.value})} /></label>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setShowEventForm(false)}>Cancel</button>
              <button type="submit" className="primary-btn" disabled={eventSaving}>{eventSaving ? "Saving..." : editingEvent ? "Save changes" : "Create event"}</button>
            </div>
          </form>
        </div>
      )}

      {showRecruitmentForm && (
        <div className="modal-backdrop" onClick={() => setShowRecruitmentForm(false)}>
          <form className="modal" style={{maxHeight:"88vh",overflowY:"auto"}} onSubmit={saveRecruitment} onClick={e => e.stopPropagation()}>
            <button type="button" className="modal-close icon-btn" onClick={() => setShowRecruitmentForm(false)}><X /></button>
            <div className="modal-icon"><UserPlus size={23}/></div>
            <h2>{editingRecruitment ? "Edit recruitment" : "Add recruitment"}</h2>
            <p>Save recruitment details and dates directly in Neo4j.</p>
            <label>Recruitment ID<input required placeholder="e.g. R004" disabled={Boolean(editingRecruitment)} value={recruitmentForm.recruitmentId} onChange={e => setRecruitmentForm({...recruitmentForm, recruitmentId:e.target.value})}/></label>
            <label>Recruitment title<input required placeholder="e.g. Design Team Recruitment" value={recruitmentForm.recruitmentTitle} onChange={e => setRecruitmentForm({...recruitmentForm, recruitmentTitle:e.target.value})}/></label>
            <label>Club<select required value={recruitmentForm.clubId} onChange={e => setRecruitmentForm({...recruitmentForm, clubId:e.target.value})}>
              <option value="">Select club</option>
              {allowedClubs.map(c => <option key={c.clubId} value={c.clubId}>{c.name}</option>)}
            </select></label>
            <label>Team<input required value={recruitmentForm.team} onChange={e => setRecruitmentForm({...recruitmentForm, team:e.target.value})}/></label>
            <label>Eligibility<input required value={recruitmentForm.eligibility} onChange={e => setRecruitmentForm({...recruitmentForm, eligibility:e.target.value})}/></label>
            <label>Start date<input required type="date" value={recruitmentForm.startDate} onChange={e => setRecruitmentForm({...recruitmentForm, startDate:e.target.value})}/></label>
            <label>End date / Deadline<input required type="date" min={recruitmentForm.startDate || undefined} value={recruitmentForm.endDate} onChange={e => setRecruitmentForm({...recruitmentForm, endDate:e.target.value})}/></label>
            <p>Status is calculated from the selected dates: Upcoming, Open or Closed.</p>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setShowRecruitmentForm(false)}>Cancel</button>
              <button type="submit" className="primary-btn" disabled={recruitmentSaving}>{recruitmentSaving ? "Saving..." : editingRecruitment ? "Save changes" : "Create recruitment"}</button>
            </div>
          </form>
        </div>
      )}

      {showClubForm && (
        <div className="modal-backdrop" onClick={() => setShowClubForm(false)}>
          <form className="modal" style={{maxHeight:"88vh",overflowY:"auto"}} onSubmit={saveClub} onClick={e => e.stopPropagation()}>
            <button type="button" className="modal-close icon-btn" onClick={() => setShowClubForm(false)}><X /></button>
            <div className="modal-icon"><Building2 size={23} /></div>
            <h2>{editingClub ? "Edit club" : "Add a club"}</h2>
            <p>Club details are stored in Neo4j.</p>
            <label>Club ID<input value={clubForm.clubId} disabled={Boolean(editingClub)} onChange={e => setClubForm({ ...clubForm, clubId: e.target.value })} placeholder="e.g. C004" required /></label>
            <label>Club name<input value={clubForm.name} onChange={e => setClubForm({ ...clubForm, name: e.target.value })} placeholder="e.g. Photography Club" required /></label>
            <label>Category<input value={clubForm.category} onChange={e => setClubForm({ ...clubForm, category: e.target.value })} placeholder="e.g. Cultural" required /></label>
            <label>Established year<input type="number" min="1900" max="2100" value={clubForm.establishedYear} onChange={e => setClubForm({ ...clubForm, establishedYear: e.target.value })} required /></label>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => setShowClubForm(false)}>Cancel</button>
              <button type="submit" className="primary-btn" disabled={clubSaving}>{clubSaving ? "Saving..." : editingClub ? "Save changes" : "Create club"}</button>
            </div>
          </form>
        </div>
      )}

      {showAddStudent && (
        <div className="modal-backdrop" onClick={() => { setShowAddStudent(false); setEditingStudent(null); }}>
          <form className="modal" style={{maxHeight:"88vh",overflowY:"auto"}} onSubmit={saveStudent} onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-close icon-btn" onClick={() => { setShowAddStudent(false); setEditingStudent(null); }}><X /></button>
            <div className="modal-icon"><Users size={23} /></div>
            <h2>{editingStudent ? "Edit student" : "Add a student"}</h2>
            <p>Changes are saved to your Neo4j database.</p>
            <label>Full name
              <input autoFocus value={studentForm.name} onChange={(e) => setStudentForm({ ...studentForm, name: e.target.value })} placeholder="e.g. Riya Shah" required />
            </label>
            <label>Register number
              <input value={studentForm.id} onChange={(e) => setStudentForm({ ...studentForm, id: e.target.value })} placeholder="e.g. 25BCE1797" disabled={Boolean(editingStudent)} required />
            </label>
            <label>Email
              <input type="email" value={studentForm.email} onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })} placeholder="e.g. riya@example.com" required />
            </label>
            <label>Department
              <select value={studentForm.dept} onChange={(e) => setStudentForm({ ...studentForm, dept: e.target.value })}>
                <option>Computer Engineering</option>
                <option>Computer Science</option>
                <option>Information Technology</option>
                <option>Electronics and Communication</option>
                <option>Mechanical Engineering</option>
                <option>Other</option>
              </select>
            </label>
            <label>Year
              <select value={studentForm.year} onChange={(e) => setStudentForm({ ...studentForm, year: e.target.value })}>
                <option>Year 1</option><option>Year 2</option><option>Year 3</option><option>Year 4</option>
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-btn" onClick={() => { setShowAddStudent(false); setEditingStudent(null); }}>Cancel</button>
              <button className="primary-btn" type="submit" disabled={studentSaving}><Plus size={16} /> {studentSaving ? "Saving..." : editingStudent ? "Save changes" : "Add student"}</button>
            </div>
          </form>
        </div>
      )}

      {toast && <div className="toast"><span>✳</span>{toast}</div>}
    </div>
  );
}

export default App;