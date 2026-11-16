import React, { useState } from 'react';
import {
  Settings,
  Bell,
  Shield,
  Layers,
  PhoneCall,
  Save,
  Check
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiFetch } from '../lib/supabase';

export const SettingsPage = () => {
  const { user, setUser, addToast, isDemoMode } = useApp();
  const [name, setName] = useState(user.name);
  const [district, setDistrict] = useState(user.district);
  const [role, setRole] = useState(user.role);
  const [soundAlerts, setSoundAlerts] = useState(true);
  const [autoSync, setAutoSync] = useState(true);
  const [teams, setTeams] = useState([]);
  const [invites, setInvites] = useState([]);
  const [teamName, setTeamName] = useState('');
  const [teamSpecialization, setTeamSpecialization] = useState('Field Response');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('rescue_team');
  const [inviteTeamId, setInviteTeamId] = useState('');
  const [adminMessage, setAdminMessage] = useState('');
  const [isAdminSaving, setIsAdminSaving] = useState(false);
  const isAdmin = !isDemoMode && user.role === 'District Administrator';

  const loadAdminData = async () => {
    setIsAdminSaving(true);
    setAdminMessage('');
    try {
      const [teamData, inviteData] = await Promise.all([
        apiFetch('/admin/teams'),
        apiFetch('/admin/staff-invites'),
      ]);
      setTeams(teamData.teams || []);
      setInvites(inviteData.invites || []);
      setAdminMessage('Staff roster loaded.');
    } catch (error) {
      setAdminMessage(error.message);
    } finally {
      setIsAdminSaving(false);
    }
  };

  const createTeam = async () => {
    if (!teamName.trim()) return setAdminMessage('Enter a team name.');
    setIsAdminSaving(true);
    setAdminMessage('');
    try {
      const result = await apiFetch('/admin/teams', {
        method: 'POST',
        body: JSON.stringify({ name: teamName.trim(), specialization: teamSpecialization.trim() }),
      });
      setTeams((current) => [...current, result.team]);
      setTeamName('');
      setAdminMessage(`Created ${result.team.name}.`);
    } catch (error) {
      setAdminMessage(error.message);
    } finally {
      setIsAdminSaving(false);
    }
  };

  const createInvite = async () => {
    if (!inviteEmail.trim()) return setAdminMessage('Enter the staff member’s email.');
    if (inviteRole === 'rescue_team' && !inviteTeamId) return setAdminMessage('Choose the assigned rescue team.');
    setIsAdminSaving(true);
    setAdminMessage('');
    try {
      const result = await apiFetch('/admin/staff-invites', {
        method: 'POST',
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, teamId: inviteRole === 'rescue_team' ? inviteTeamId : null }),
      });
      setInvites((current) => [result.invite, ...current.filter((item) => item.email !== result.invite.email)]);
      setInviteEmail('');
      setAdminMessage('Invitation saved. The invited user must sign up with this email and confirm it.');
    } catch (error) {
      setAdminMessage(error.message);
    } finally {
      setIsAdminSaving(false);
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    setUser(prev => ({ ...prev, name, district, role: isDemoMode ? role : prev.role }));
    addToast({
      type: 'team-assigned',
      title: 'Preferences Saved',
      code: 'Operational settings updated',
      detail: 'Configuration persisted for active session.'
    });
  };

  return (
    <div style={{ padding: '28px 32px', maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.4px' }}>
          Platform Settings
        </h1>
        <p style={{ fontSize: '13px', color: '#94A3B8', marginTop: '4px' }}>
          Configure operational parameters, operator profile, and emergency radio feeds.
        </p>
      </div>

      {isAdmin && (
        <section aria-labelledby="staff-team-heading" style={{ backgroundColor: '#0D1527', border: '1px solid #16243E', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <h2 id="staff-team-heading" style={{ color: '#FFFFFF', fontSize: '17px', fontWeight: 700 }}>Staff and rescue teams</h2>
              <p style={{ color: '#64748B', fontSize: '12px', marginTop: '4px' }}>Staff roles are server-assigned. Rescue access is limited to the invited team.</p>
            </div>
            <button type="button" onClick={loadAdminData} disabled={isAdminSaving} style={{ padding: '9px 12px', borderRadius: '8px', background: '#1E293B', color: '#E2E8F0', fontWeight: 600 }}>
              {isAdminSaving ? 'Working…' : 'Refresh roster'}
            </button>
          </div>

          {adminMessage && <p role="status" style={{ color: '#93C5FD', fontSize: '12px' }}>{adminMessage}</p>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
            <div style={{ background: '#070C16', border: '1px solid #16243E', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h3 style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: 700 }}>Create a rescue team</h3>
              <label htmlFor="team-name" style={{ color: '#94A3B8', fontSize: '12px' }}>Team name</label>
              <input id="team-name" value={teamName} onChange={(event) => setTeamName(event.target.value)} maxLength={120} style={{ width: '100%', padding: '10px', background: '#0D1527', border: '1px solid #1A263D', borderRadius: '8px', color: '#FFFFFF' }} />
              <label htmlFor="team-specialty" style={{ color: '#94A3B8', fontSize: '12px' }}>Specialization</label>
              <input id="team-specialty" value={teamSpecialization} onChange={(event) => setTeamSpecialization(event.target.value)} maxLength={120} style={{ width: '100%', padding: '10px', background: '#0D1527', border: '1px solid #1A263D', borderRadius: '8px', color: '#FFFFFF' }} />
              <button type="button" onClick={createTeam} disabled={isAdminSaving} style={{ padding: '10px', borderRadius: '8px', background: '#2563EB', color: '#FFFFFF', fontWeight: 700 }}>Create team</button>
            </div>

            <div style={{ background: '#070C16', border: '1px solid #16243E', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h3 style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: 700 }}>Invite staff</h3>
              <label htmlFor="staff-email" style={{ color: '#94A3B8', fontSize: '12px' }}>Organization email</label>
              <input id="staff-email" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} autoComplete="email" maxLength={254} style={{ width: '100%', padding: '10px', background: '#0D1527', border: '1px solid #1A263D', borderRadius: '8px', color: '#FFFFFF' }} />
              <label htmlFor="staff-role" style={{ color: '#94A3B8', fontSize: '12px' }}>Role</label>
              <select id="staff-role" value={inviteRole} onChange={(event) => setInviteRole(event.target.value)} style={{ width: '100%', padding: '10px', background: '#0D1527', border: '1px solid #1A263D', borderRadius: '8px', color: '#FFFFFF' }}>
                <option value="rescue_team">Rescue team</option>
                <option value="command_operator">Command operator</option>
              </select>
              {inviteRole === 'rescue_team' && <>
                <label htmlFor="invite-team" style={{ color: '#94A3B8', fontSize: '12px' }}>Assigned team</label>
                <select id="invite-team" value={inviteTeamId} onChange={(event) => setInviteTeamId(event.target.value)} style={{ width: '100%', padding: '10px', background: '#0D1527', border: '1px solid #1A263D', borderRadius: '8px', color: '#FFFFFF' }}>
                  <option value="">Select a team</option>
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </>}
              <button type="button" onClick={createInvite} disabled={isAdminSaving} style={{ padding: '10px', borderRadius: '8px', background: '#2563EB', color: '#FFFFFF', fontWeight: 700 }}>Save invitation</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
            <div>
              <h3 style={{ color: '#E2E8F0', fontSize: '13px', marginBottom: '8px' }}>Teams ({teams.length})</h3>
              {teams.map((team) => <p key={team.id} style={{ color: '#94A3B8', fontSize: '12px', padding: '6px 0' }}>{team.name} · {team.specialization}</p>)}
            </div>
            <div>
              <h3 style={{ color: '#E2E8F0', fontSize: '13px', marginBottom: '8px' }}>Invitations ({invites.length})</h3>
              {invites.map((invite) => <p key={invite.email} style={{ color: '#94A3B8', fontSize: '12px', padding: '6px 0' }}>{invite.email} · {invite.role}{invite.accepted_at ? ' · active' : ' · awaiting confirmation'}</p>)}
            </div>
          </div>
        </section>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Profile Card */}
        <div
          style={{
            backgroundColor: '#0D1527',
            border: '1px solid #16243E',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield size={18} color="#3B82F6" />
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF' }}>
              Operator Profile
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94A3B8', marginBottom: '6px' }}>
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  backgroundColor: '#070C16',
                  border: '1px solid #1A263D',
                  borderRadius: '8px',
                  color: '#FFFFFF',
                  fontSize: '13.5px'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#94A3B8', marginBottom: '6px' }}>
                Assigned Operational Role
              </label>
              <select
                value={isDemoMode ? role : user.role}
                disabled={!isDemoMode}
                onChange={(e) => setRole(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  backgroundColor: '#070C16',
                  border: '1px solid #1A263D',
                  borderRadius: '8px',
                  color: '#FFFFFF',
                  fontSize: '13.5px'
                }}
              >
                <option value="Command Operator">Command Operator</option>
                <option value="Field Responder">Field Responder</option>
                <option value="District Administrator">District Administrator</option>
              </select>
            </div>
          </div>
        </div>

        {/* Telemetry & Audio Card */}
        <div
          style={{
            backgroundColor: '#0D1527',
            border: '1px solid #16243E',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Bell size={18} color="#3B82F6" />
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF' }}>
              Telemetry & Alerts
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div>
                <div style={{ fontSize: '13.5px', color: '#FFFFFF', fontWeight: 500 }}>
                  High Severity Siren Chimes
                </div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                  Play audible warning for new unverified High priority incidents
                </div>
              </div>
              <input
                type="checkbox"
                checked={soundAlerts}
                onChange={(e) => setSoundAlerts(e.target.checked)}
                style={{ accentColor: '#2563EB', width: '18px', height: '18px' }}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div>
                <div style={{ fontSize: '13.5px', color: '#FFFFFF', fontWeight: 500 }}>
                  Continuous Satellite Refresh
                </div>
                <div style={{ fontSize: '12px', color: '#64748B' }}>
                  Auto-synchronize GIS overlay every 30 seconds
                </div>
              </div>
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                style={{ accentColor: '#2563EB', width: '18px', height: '18px' }}
              />
            </label>
          </div>
        </div>

        {/* Emergency Hotline Directory */}
        <div
          style={{
            backgroundColor: '#0D1527',
            border: '1px solid #16243E',
            borderRadius: '16px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <PhoneCall size={18} color="#EF4444" />
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF' }}>
              {isDemoMode ? 'Kerala State Emergency Hotlines' : 'Uttarakhand State Emergency Hotlines (SEOC)'}
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginTop: '6px' }}>
            <div style={{ padding: '12px', backgroundColor: '#070C16', borderRadius: '8px', border: '1px solid #162238' }}>
              <div style={{ fontSize: '11px', color: '#64748B' }}>Disaster Helpline</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#EF4444' }}>1077</div>
            </div>
            <div style={{ padding: '12px', backgroundColor: '#070C16', borderRadius: '8px', border: '1px solid #162238' }}>
              <div style={{ fontSize: '11px', color: '#64748B' }}>Emergency Response</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#38BDF8' }}>112</div>
            </div>
            <div style={{ padding: '12px', backgroundColor: '#070C16', borderRadius: '8px', border: '1px solid #162238' }}>
              <div style={{ fontSize: '11px', color: '#64748B' }}>Ambulance Dispatch</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#10B981' }}>108</div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '12px 24px',
            borderRadius: '10px',
            backgroundColor: '#2563EB',
            color: '#FFFFFF',
            fontSize: '14px',
            fontWeight: 600,
            alignSelf: 'flex-start'
          }}
        >
          <Save size={16} />
          <span>Save Configuration</span>
        </button>
      </form>
    </div>
  );
};
