import React, { useState } from 'react';
import {
  ShieldAlert,
  Mail,
  Lock,
  ChevronDown,
  ArrowRight,
  ShieldCheck,
  Check
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const Login = () => {
  const { login, registerCommand, enterDemoMode } = useApp();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [fullName, setFullName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Command Operator');
  const [rememberMe, setRememberMe] = useState(true);
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const roles = [
    'Command Operator',
    'Field Responder',
    'District Administrator'
  ];

  const handleSignIn = async (e, isDemo = false) => {
    e.preventDefault();
    setErrorMsg('');
    if (isDemo) {
      enterDemoMode(email || 'ananya.kumar@resqcore.gov.in', role);
      return;
    }
    if (!email.trim() || !password) {
      setErrorMsg('Please enter your work email and password.');
      return;
    }
    if (mode === 'register' && !fullName.trim()) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    setSubmitting(true);
    try {
      if (mode === 'register') {
        await registerCommand({ name: fullName, email, password, inviteCode, remember: rememberMe });
      } else {
        await login(email, password, rememberMe);
      }
    } catch (err) {
      setErrorMsg(err.message || (mode === 'register' ? 'Registration failed' : 'Sign-in failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        width: '100%',
        backgroundColor: '#070C16',
        color: '#FFFFFF'
      }}
    >
      {/* Left Hero Pane (Matching Frame 1.png) */}
      <div
        style={{
          flex: '1.1',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '48px 56px',
          backgroundImage: `url('/assets/satellite.png')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          overflow: 'hidden'
        }}
      >
        {/* Dark Tactical Vignette Overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, rgba(7, 12, 22, 0.7) 0%, rgba(7, 12, 22, 0.88) 100%)',
            pointerEvents: 'none'
          }}
        />

        {/* Top Header */}
        <div style={{ position: 'relative', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: '#2563EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(37, 99, 235, 0.4)'
              }}
            >
              <ShieldAlert size={24} color="#FFFFFF" />
            </div>
            <span style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.3px' }}>
              ResQCore
            </span>
          </div>
        </div>

        {/* Center Hero Content */}
        <div style={{ position: 'relative', zIndex: 10, maxWidth: '560px' }}>
          {/* Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '9999px',
              backgroundColor: 'rgba(37, 99, 235, 0.25)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              color: '#60A5FA',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.8px',
              marginBottom: '24px'
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#3B82F6'
              }}
            />
            LIVE OPERATIONAL INTELLIGENCE
          </div>

          <h1
            style={{
              fontSize: '48px',
              fontWeight: 800,
              letterSpacing: '-1.5px',
              lineHeight: 1.15,
              color: '#FFFFFF'
            }}
          >
            Clarity when it matters most.
          </h1>

          <p
            style={{
              fontSize: '16px',
              color: '#94A3B8',
              lineHeight: 1.6,
              marginTop: '18px'
            }}
          >
            One command center for incidents, response teams and critical decisions.
            Stay connected. Coordinate with confidence.
          </p>

          {/* 3 Metric Stats */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '24px',
              marginTop: '44px',
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              paddingTop: '32px'
            }}
          >
            <div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#FFFFFF' }}>
                14 districts
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                Connected across Kerala
              </div>
            </div>

            <div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#FFFFFF' }}>
                24/7
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                Operational visibility
              </div>
            </div>

            <div>
              <div style={{ fontSize: '28px', fontWeight: 800, color: '#FFFFFF' }}>
                Secure
              </div>
              <div style={{ fontSize: '12px', color: '#64748B', marginTop: '4px' }}>
                Role-based access
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Coordinates */}
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '11px',
            color: '#475569',
            letterSpacing: '0.6px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            paddingTop: '20px'
          }}
        >
          <span>KERALA STATE DISASTER RESPONSE</span>
          <span className="mono">9.9658° N · 76.2421° E</span>
        </div>
      </div>

      {/* Right Login Pane */}
      <div
        style={{
          flex: '0.9',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#070C16',
          padding: '48px 40px',
          borderLeft: '1px solid #16243E'
        }}
      >
        <div style={{ width: '100%', maxWidth: '420px' }}>
          {/* Top Shield Emblem */}
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              backgroundColor: 'rgba(37, 99, 235, 0.15)',
              border: '1px solid rgba(37, 99, 235, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px'
            }}
          >
            <ShieldCheck size={24} color="#3B82F6" />
          </div>

          <h2
            style={{
              fontSize: '28px',
              fontWeight: 700,
              color: '#FFFFFF',
              letterSpacing: '-0.5px'
            }}
          >
            Welcome to ResQCore
          </h2>
          <p style={{ fontSize: '14px', color: '#64748B', marginTop: '6px' }}>
            {mode === 'register'
              ? 'Create a Command Center operator account.'
              : 'Sign in to your disaster response workspace.'}
          </p>

          {/* Mode Toggle */}
          <div
            style={{
              display: 'flex',
              gap: '6px',
              marginTop: '20px',
              padding: '4px',
              backgroundColor: '#0D1527',
              border: '1px solid #1A263D',
              borderRadius: '10px'
            }}
          >
            <button
              type="button"
              onClick={() => { setMode('login'); setErrorMsg(''); }}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '7px',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: mode === 'login' ? '#2563EB' : 'transparent',
                color: mode === 'login' ? '#FFFFFF' : '#94A3B8'
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setErrorMsg(''); }}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '7px',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: mode === 'register' ? '#2563EB' : 'transparent',
                color: mode === 'register' ? '#FFFFFF' : '#94A3B8'
              }}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSignIn} style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {mode === 'register' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#94A3B8',
                    marginBottom: '8px'
                  }}
                >
                  Full name
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 14px',
                    backgroundColor: '#0D1527',
                    border: '1px solid #1A263D',
                    borderRadius: '10px'
                  }}
                >
                  <input
                    type="text"
                    placeholder="Devank"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#FFFFFF',
                      fontSize: '13.5px',
                      width: '100%'
                    }}
                  />
                </div>
              </div>
            )}
            {/* Email Field */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#94A3B8',
                  marginBottom: '8px'
                }}
              >
                Work email
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 14px',
                  backgroundColor: '#0D1527',
                  border: '1px solid #1A263D',
                  borderRadius: '10px'
                }}
              >
                <Mail size={16} color="#64748B" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: '13.5px',
                    width: '100%'
                  }}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#94A3B8',
                  marginBottom: '8px'
                }}
              >
                Password
              </label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 14px',
                  backgroundColor: '#0D1527',
                  border: '1px solid #1A263D',
                  borderRadius: '10px'
                }}
              >
                <Lock size={16} color="#64748B" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#FFFFFF',
                    fontSize: '13.5px',
                    width: '100%'
                  }}
                />
              </div>
            </div>

            {/* Role Selector */}
            <div style={{ position: 'relative' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#94A3B8',
                  marginBottom: '8px'
                }}
              >
                Your role
              </label>
              <div
                onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  backgroundColor: '#0D1527',
                  border: '1px solid #1A263D',
                  borderRadius: '10px',
                  cursor: 'pointer'
                }}
              >
                <span style={{ fontSize: '13.5px', color: '#FFFFFF' }}>{role}</span>
                <ChevronDown size={16} color="#64748B" />
              </div>

              {isRoleDropdownOpen && (
                <div
                  className="animate-slide-up"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    right: 0,
                    backgroundColor: '#0E172A',
                    border: '1px solid #1E293B',
                    borderRadius: '10px',
                    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.8)',
                    padding: '6px',
                    zIndex: 50
                  }}
                >
                  {roles.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setRole(r);
                        setIsRoleDropdownOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        backgroundColor: role === r ? '#1E293B' : 'transparent',
                        color: role === r ? '#FFFFFF' : '#94A3B8',
                        fontSize: '13px',
                        textAlign: 'left'
                      }}
                    >
                      <span>{r}</span>
                      {role === r && <Check size={14} color="#3B82F6" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Remember Me & Forgot Password */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '13px'
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#CBD5E1',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{
                    accentColor: '#2563EB',
                    width: '15px',
                    height: '15px'
                  }}
                />
                Remember this device
              </label>

              <a
                href="#forgot"
                onClick={(e) => {
                  e.preventDefault();
                  alert('Password reset link sent to district coordinator.');
                }}
                style={{ color: '#3B82F6', fontWeight: 500 }}
              >
                Forgot password?
              </a>
            </div>

            {errorMsg && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  color: '#FCA5A5',
                  fontSize: '12.5px',
                  fontWeight: 500
                }}
              >
                {errorMsg}
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#94A3B8',
                    marginBottom: '8px'
                  }}
                >
                  Invite code <span style={{ color: '#64748B', fontWeight: 400 }}>(optional in dev)</span>
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 14px',
                    backgroundColor: '#0D1527',
                    border: '1px solid #1A263D',
                    borderRadius: '10px'
                  }}
                >
                  <input
                    type="text"
                    placeholder="COMMAND_INVITE_CODE if configured"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#FFFFFF',
                      fontSize: '13.5px',
                      width: '100%'
                    }}
                  />
                </div>
              </div>
            )}

            {/* CTA Button */}
            <button
              type="submit"
              disabled={submitting}
              onClick={(e) => handleSignIn(e, false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                width: '100%',
                padding: '13px',
                borderRadius: '10px',
                backgroundColor: '#2563EB',
                color: '#FFFFFF',
                fontWeight: 600,
                fontSize: '14.5px',
                boxShadow: '0 4px 16px rgba(37, 99, 235, 0.4)',
                marginTop: '6px',
                opacity: submitting ? 0.7 : 1,
                cursor: submitting ? 'not-allowed' : 'pointer'
              }}
              onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.backgroundColor = '#3B82F6'; }}
              onMouseLeave={(e) => { if (!submitting) e.currentTarget.style.backgroundColor = '#2563EB'; }}
            >
              <span>
                {submitting
                  ? mode === 'register'
                    ? 'Creating account...'
                    : 'Signing in...'
                  : mode === 'register'
                  ? 'Create account & enter'
                  : 'Sign in to command center'}
              </span>
              <ArrowRight size={16} />
            </button>

            {/* Demo Mode Button */}
            <button
              type="button"
              onClick={(e) => handleSignIn(e, true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                width: '100%',
                padding: '13px',
                borderRadius: '10px',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#10B981',
                fontWeight: 600,
                fontSize: '14.5px',
                marginTop: '4px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.2)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.1)')}
            >
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#10B981',
                animation: 'pulseGlow 1s infinite'
              }} />
              <span>Enter Live Demo Mode</span>
            </button>
          </form>

          {/* Footer Notes */}
          <div
            style={{
              marginTop: '28px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                fontSize: '11px',
                color: '#64748B'
              }}
            >
              <ShieldCheck size={13} />
              <span>Authorized personnel only · Encrypted connection</span>
            </div>

            <div style={{ fontSize: '12px', color: '#475569' }}>
              Need access?{' '}
              <span style={{ color: '#94A3B8' }}>Contact your district administrator.</span>
            </div>

            <div style={{ fontSize: '11px', color: '#334155', marginTop: '12px' }}>
              ResQCore v2.4 · Emergency access: 1077
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
