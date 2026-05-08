import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card, Button, Input, Tabs, Typography, Table, Tag, Statistic,
  Row, Col, Modal, Spin, App,
} from 'antd';
import {
  QrcodeOutlined, IdcardOutlined, ReloadOutlined,
  CheckCircleOutlined, CloseCircleOutlined, UserOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { Html5Qrcode } from 'html5-qrcode';
import api from '../../../lib/api';

const { Text, Title } = Typography;

interface AttendedEntry {
  user_id: number;
  name: string;
  email: string;
  marked_via: 'qr' | 'code' | 'host';
  attendance_time: string;
}

interface AbsentEntry {
  user_id: number;
  name: string;
  email: string;
}

interface AttendanceLog {
  meeting_id: number;
  meeting_title: string;
  total_invited: number;
  total_attended: number;
  attendance_pct: number;
  attended: AttendedEntry[];
  absent: AbsentEntry[];
}

interface QRData {
  token: string;
  expires_at: string;
  meeting_id: number;
  meeting_title: string;
  qr_image: string;
}

interface Props {
  meetingId: number | string;
  isCreator: boolean;
  meetingStatus: string;
  /** Called after creator successfully starts the meeting so parent can update status */
  onMeetingStarted?: () => void;
}

const VIA_LABELS: Record<string, { color: string; label: string }> = {
  qr:   { color: 'blue',   label: 'QR Scan' },
  code: { color: 'green',  label: 'Employee Code' },
  host: { color: 'purple', label: 'Host' },
};

const MomAttendancePanel: React.FC<Props> = ({
  meetingId, isCreator, meetingStatus, onMeetingStarted,
}) => {
  const { message } = App.useApp();
  const msgRef = useRef(message);
  useEffect(() => { msgRef.current = message; }, [message]);

  const isLive      = meetingStatus === 'live';
  const isCompleted = meetingStatus === 'completed' || meetingStatus === 'cancelled';
  const isScheduled = !isLive && !isCompleted;

  const [qrData,      setQrData]      = useState<QRData | null>(null);
  const [qrLoading,   setQrLoading]   = useState(false);
  const [startLoading, setStartLoading] = useState(false);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanning,    setScanning]    = useState(false);
  const scannerRef   = useRef<Html5Qrcode | null>(null);
  const scannerDivId = 'mom-qr-scanner';

  const [empCode,     setEmpCode]     = useState('');
  const [codeLoading, setCodeLoading] = useState(false);

  const [log,         setLog]         = useState<AttendanceLog | null>(null);
  const [logLoading,  setLogLoading]  = useState(false);

  // ── Auto-refresh log while live ─────────────────────────────────────────
  const fetchLog = useCallback(async () => {
    if (!isCreator) return;
    setLogLoading(true);
    try {
      const res = await api.get(`/api/v1/mom/${meetingId}/attendance/log/`);
      setLog(res.data);
    } catch { /* silently ignore */ } finally {
      setLogLoading(false);
    }
  }, [meetingId, isCreator]);

  useEffect(() => {
    if (isCreator && isLive) {
      fetchLog();
      const t = setInterval(fetchLog, 15000);
      return () => clearInterval(t);
    }
  }, [isCreator, isLive, fetchLog]);

  // ── Start Meeting ────────────────────────────────────────────────────────
  const handleStartMeeting = async () => {
    setStartLoading(true);
    try {
      await api.post(`/api/v1/mom/${meetingId}/start/`);
      msgRef.current.success('Meeting is now LIVE! Attendance is open.');
      onMeetingStarted?.();
    } catch (err: any) {
      msgRef.current.error(err?.response?.data?.error || 'Failed to start meeting.');
    } finally {
      setStartLoading(false);
    }
  };

  // ── Generate QR ──────────────────────────────────────────────────────────
  const generateQR = async () => {
    setQrLoading(true);
    try {
      const res = await api.get(`/api/v1/mom/${meetingId}/qr/`);
      setQrData(res.data);
      msgRef.current.success('QR code generated.');
      fetchLog();
    } catch (err: any) {
      msgRef.current.error(err?.response?.data?.error || 'Failed to generate QR code.');
    } finally {
      setQrLoading(false);
    }
  };

  // ── QR Scanner ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scannerOpen) return;
    const scanner = new Html5Qrcode(scannerDivId);
    scannerRef.current = scanner;
    setScanning(true);
    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      async (decoded) => {
        await scanner.stop();
        setScanning(false);
        setScannerOpen(false);
        await submitQRToken(decoded.trim());
      },
      () => {}
    ).catch(() => {
      msgRef.current.error('Camera access denied.');
      setScanning(false);
      setScannerOpen(false);
    });
    return () => { scanner.stop().catch(() => {}); };
  }, [scannerOpen]);

  const submitQRToken = async (token: string) => {
    let lat: number | undefined, lng: number | undefined;
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 })
      );
      lat = pos.coords.latitude; lng = pos.coords.longitude;
    } catch { /* optional */ }
    try {
      const res = await api.post('/api/v1/mom/attendance/qr/', { token, latitude: lat, longitude: lng });
      if (res.data?.already_registered) {
        msgRef.current.warning(res.data.message || 'Attendance already registered.');
      } else {
        msgRef.current.success(res.data.message || 'Attendance marked!');
      }
    } catch (err: any) {
      if (err?.response?.status === 409) msgRef.current.warning('Attendance already registered.');
      else msgRef.current.error(err?.response?.data?.error || 'Failed to mark attendance.');
    }
  };

  const stopScanner = () => {
    scannerRef.current?.stop().catch(() => {});
    setScanning(false);
    setScannerOpen(false);
  };

  // ── Employee Code ────────────────────────────────────────────────────────
  const submitCode = async () => {
    if (!empCode.trim()) { msgRef.current.warning('Enter your employee code.'); return; }
    setCodeLoading(true);
    try {
      const res = await api.post(`/api/v1/mom/${meetingId}/attendance/code/`, {
        employee_code: empCode.trim(),
      });
      if (res.data?.already_registered) {
        msgRef.current.warning(res.data.message || 'Attendance already registered.');
      } else {
        msgRef.current.success(res.data.message || 'Attendance marked!');
      }
      setEmpCode('');
      if (isCreator) fetchLog();
    } catch (err: any) {
      if (err?.response?.status === 409) msgRef.current.warning('Attendance already registered.');
      else msgRef.current.error(err?.response?.data?.error || 'Failed to mark attendance.');
    } finally {
      setCodeLoading(false);
    }
  };

  // ── Table columns ────────────────────────────────────────────────────────
  const attendedCols = [
    { title: '#', key: 'i', render: (_: any, __: any, i: number) => i + 1, width: 45 },
    { title: 'Name',  dataIndex: 'name',  key: 'name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Method', dataIndex: 'marked_via', key: 'via',
      render: (v: string) => { const m = VIA_LABELS[v] || { color: 'default', label: v }; return <Tag color={m.color}>{m.label}</Tag>; } },
    { title: 'Time', dataIndex: 'attendance_time', key: 'time',
      render: (t: string) => new Date(t).toLocaleTimeString() },
  ];
  const absentCols = [
    { title: '#', key: 'i', render: (_: any, __: any, i: number) => i + 1, width: 45 },
    { title: 'Name',  dataIndex: 'name',  key: 'name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
  ];

  // ── COMPLETED / CANCELLED ────────────────────────────────────────────────
  if (isCompleted) {
    return (
      <Card size="small" style={{ marginTop: 16 }}>
        <Text type="secondary">
          <CloseCircleOutlined style={{ marginRight: 6 }} />
          Attendance is closed — this meeting has ended.
        </Text>
      </Card>
    );
  }

  // ── SCHEDULED — creator sees Start button, participants see waiting msg ──
  if (isScheduled) {
    if (isCreator) {
      return (
        <Card
          size="small"
          style={{ marginTop: 16, borderColor: '#1890ff' }}
          title={<Text strong style={{ color: '#1890ff' }}>Meeting Not Started Yet</Text>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
            <Text type="secondary">
              Click <strong>Start Meeting</strong> to open attendance for participants.
              QR code and employee code attendance will become available once the meeting is live.
            </Text>
            <Button
              type="primary"
              size="large"
              icon={<PlayCircleOutlined />}
              loading={startLoading}
              onClick={handleStartMeeting}
              style={{ background: '#52c41a', borderColor: '#52c41a' }}
            >
              Start Meeting
            </Button>
          </div>
        </Card>
      );
    }
    return (
      <Card size="small" style={{ marginTop: 16 }}>
        <Text type="secondary">
          <CloseCircleOutlined style={{ marginRight: 6 }} />
          Attendance is not open yet — waiting for the host to start the meeting.
        </Text>
      </Card>
    );
  }

  // ── LIVE ─────────────────────────────────────────────────────────────────
  const codeEntry = (placeholder: string, label: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Text type="secondary">
        {isCreator
          ? "Enter a participant's employee code (username) to mark their attendance."
          : 'Enter your employee code (username) to mark your attendance.'}
      </Text>
      <Input
        placeholder={placeholder}
        value={empCode}
        onChange={e => setEmpCode(e.target.value)}
        onPressEnter={submitCode}
        prefix={<UserOutlined />}
        allowClear
      />
      <Button type="primary" icon={<CheckCircleOutlined />} onClick={submitCode} loading={codeLoading} block>
        {label}
      </Button>
    </div>
  );

  const participantTabs = [
    {
      key: 'scan',
      label: <span><QrcodeOutlined /> Scan QR</span>,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Text type="secondary">Ask the host to display the QR code, then tap Scan.</Text>
          <Button type="primary" icon={<QrcodeOutlined />} onClick={() => setScannerOpen(true)} block>
            Open Camera &amp; Scan QR
          </Button>
          <Modal
            title="Scan Meeting QR Code"
            open={scannerOpen}
            onCancel={stopScanner}
            footer={<Button onClick={stopScanner}>Cancel</Button>}
            destroyOnHidden
          >
            <div id={scannerDivId} style={{ width: '100%' }} />
            {scanning && (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <Spin /><Text style={{ marginLeft: 8 }}>Scanning…</Text>
              </div>
            )}
          </Modal>
        </div>
      ),
    },
    {
      key: 'code',
      label: <span><IdcardOutlined /> Employee Code</span>,
      children: codeEntry('e.g. sethu_09', 'Mark My Attendance'),
    },
  ];

  const creatorTabs = [
    {
      key: 'qr',
      label: <span><QrcodeOutlined /> QR Code</span>,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button type="primary" icon={<QrcodeOutlined />} onClick={generateQR} loading={qrLoading} block>
            {qrData ? 'Refresh QR Code' : 'Generate QR Code'}
          </Button>
          {qrData && (
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <img
                src={qrData.qr_image}
                alt="Meeting QR Code"
                style={{ width: 220, height: 220, border: '1px solid #f0f0f0', borderRadius: 8 }}
              />
              <div style={{ marginTop: 6 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Expires: {new Date(qrData.expires_at).toLocaleTimeString()}
                </Text>
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'code',
      label: <span><IdcardOutlined /> Mark by Code</span>,
      children: codeEntry('Employee code / username', 'Mark Attendance'),
    },
    {
      key: 'log',
      label: <span><CheckCircleOutlined /> Live Log</span>,
      children: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {log && (
            <Row gutter={16}>
              <Col span={8}>
                <Statistic title="Invited" value={log.total_invited} prefix={<UserOutlined />} />
              </Col>
              <Col span={8}>
                <Statistic title="Attended" value={log.total_attended}
                  styles={{ content: { color: '#3f8600' } }} prefix={<CheckCircleOutlined />} />
              </Col>
              <Col span={8}>
                <Statistic title="Attendance %" value={log.attendance_pct} suffix="%"
                  styles={{ content: { color: log.attendance_pct >= 75 ? '#3f8600' : '#cf1322' } }} />
              </Col>
            </Row>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Title level={5} style={{ margin: 0 }}>Attended ({log?.attended.length ?? 0})</Title>
            <Button size="small" icon={<ReloadOutlined />} onClick={fetchLog} loading={logLoading}>Refresh</Button>
          </div>
          <Table dataSource={log?.attended ?? []} columns={attendedCols} rowKey="user_id"
            size="small" pagination={false} loading={logLoading}
            locale={{ emptyText: 'No attendance recorded yet.' }} />
          <Title level={5} style={{ marginTop: 8 }}>Absent ({log?.absent.length ?? 0})</Title>
          <Table dataSource={log?.absent ?? []} columns={absentCols} rowKey="user_id"
            size="small" pagination={false} loading={logLoading}
            locale={{ emptyText: 'All participants have attended!' }} />
        </div>
      ),
    },
  ];

  return (
    <Card
      title={
        <span>
          <CheckCircleOutlined style={{ marginRight: 8, color: '#52c41a' }} />
          Meeting Attendance
          <Tag color="green" style={{ marginLeft: 8 }}>LIVE</Tag>
        </span>
      }
      style={{ marginTop: 24 }}
      size="small"
    >
      <Tabs items={isCreator ? creatorTabs : participantTabs} defaultActiveKey={isCreator ? 'qr' : 'scan'} />
    </Card>
  );
};

export default MomAttendancePanel;
