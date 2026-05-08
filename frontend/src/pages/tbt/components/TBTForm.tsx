import React, { useEffect, useState, useCallback } from 'react';
import {
  Form, Input, DatePicker, Button, Card, Space, InputNumber, Select,
  Divider, Tag, Checkbox, Spin, message, TimePicker, Row, Col,
} from 'antd';
import {
  SaveOutlined, CloseOutlined, PlusOutlined, DeleteOutlined,
  UserAddOutlined, SearchOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiClient from '../../../lib/api';

const { TextArea } = Input;

interface Participant {
  id: number;
  name: string;
  email: string;
  department: string;
  designation: string;
  participant_type: 'user' | 'worker';
  photo?: string | null;
}

interface DiscussionPoint {
  type: string;
  content: string;
}

const DISCUSSION_TYPES = [
  { value: 'work_description', label: 'Work Description' },
  { value: 'hazard', label: 'Hazard Identification' },
  { value: 'precautions', label: 'Safety Precautions' },
  { value: 'ppe', label: 'PPE Requirements' },
  { value: 'emergency', label: 'Emergency Instructions' },
  { value: 'general', label: 'General Notes' },
];

interface TBTFormProps {
  tbtId: number | null;
  onSuccess: (tbt: any) => void;
  onCancel: () => void;
}

const TBTForm: React.FC<TBTFormProps> = ({ tbtId, onSuccess, onCancel }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Participants
  const [participantSearch, setParticipantSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Participant[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedParticipants, setSelectedParticipants] = useState<Participant[]>([]);

  // Discussion points
  const [discussionPoints, setDiscussionPoints] = useState<DiscussionPoint[]>([
    { type: 'work_description', content: '' },
    { type: 'hazard', content: '' },
    { type: 'precautions', content: '' },
    { type: 'ppe', content: '' },
  ]);

  useEffect(() => {
    if (tbtId) {
      loadTBT();
    } else {
      form.resetFields();
      setSelectedParticipants([]);
      setDiscussionPoints([
        { type: 'work_description', content: '' },
        { type: 'hazard', content: '' },
        { type: 'precautions', content: '' },
        { type: 'ppe', content: '' },
      ]);
    }
  }, [tbtId]);

  const loadTBT = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/api/tbt/${tbtId}/`);
      const data = res.data;
      form.setFieldsValue({
        title: data.title,
        description: data.description,
        date: data.date ? dayjs(data.date) : null,
        duration: data.duration,
        duration_unit: data.duration_unit,
        location: data.location,
        work_area: data.work_area,
        start_time: data.start_time ? dayjs(data.start_time, 'HH:mm:ss') : null,
        end_time: data.end_time ? dayjs(data.end_time, 'HH:mm:ss') : null,
        conducted_by: data.conducted_by,
        training_type: data.training_type,
        status: data.status,
      });
      if (data.discussion_points?.length) {
        setDiscussionPoints(data.discussion_points);
      }
      if (data.user_participants_details?.length) {
        setSelectedParticipants(data.user_participants_details.map((u: any) => ({
          id: u.id,
          name: u.full_name || u.name || u.username,
          email: u.email || '',
          department: u.department || '',
          designation: u.designation || '',
          participant_type: 'user',
        })));
      }
    } catch (err: any) {
      console.error('[TBT] Load failed:', err);
      message.error('Failed to load TBT');
    } finally {
      setLoading(false);
    }
  };

  const searchParticipants = useCallback(async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await apiClient.get('/api/tbt/participants/search/', { params: { q } });
      setSearchResults(res.data.results || []);
    } catch (err) {
      console.error('[TBT] Participant search failed:', err);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchParticipants(participantSearch), 300);
    return () => clearTimeout(t);
  }, [participantSearch, searchParticipants]);

  const toggleParticipant = (p: Participant) => {
    setSelectedParticipants(prev => {
      const key = `${p.participant_type}-${p.id}`;
      const exists = prev.some(x => `${x.participant_type}-${x.id}` === key);
      return exists ? prev.filter(x => `${x.participant_type}-${x.id}` !== key) : [...prev, p];
    });
  };

  const removeParticipant = (p: Participant) => {
    setSelectedParticipants(prev =>
      prev.filter(x => !(x.id === p.id && x.participant_type === p.participant_type))
    );
  };

  const addDiscussionPoint = () => {
    setDiscussionPoints(prev => [...prev, { type: 'general', content: '' }]);
  };

  const removeDiscussionPoint = (idx: number) => {
    setDiscussionPoints(prev => prev.filter((_, i) => i !== idx));
  };

  const updateDiscussionPoint = (idx: number, field: 'type' | 'content', value: string) => {
    setDiscussionPoints(prev => prev.map((dp, i) => i === idx ? { ...dp, [field]: value } : dp));
  };

  const handleSubmit = async (values: any) => {
    console.log('[TBT] Submit clicked, values:', values);
    setSubmitting(true);

    const payload = {
      title: values.title,
      description: values.description || '',
      date: values.date ? values.date.format('YYYY-MM-DD') : null,
      duration: values.duration || 30,
      duration_unit: values.duration_unit || 'minutes',
      location: values.location,
      work_area: values.work_area || '',
      start_time: values.start_time ? values.start_time.format('HH:mm:ss') : null,
      end_time: values.end_time ? values.end_time.format('HH:mm:ss') : null,
      conducted_by: values.conducted_by,
      training_type: values.training_type || 'toolbox_training',
      status: values.status || 'draft',
      discussion_points: discussionPoints.filter(dp => dp.content.trim()),
      user_participant_ids: selectedParticipants
        .filter(p => p.participant_type === 'user')
        .map(p => p.id),
    };

    console.log('[TBT] Payload:', payload);

    try {
      let res;
      if (tbtId) {
        res = await apiClient.patch(`/api/tbt/update/${tbtId}/`, payload);
        console.log('[TBT] Update response:', res.data);
        message.success('TBT updated successfully');
      } else {
        res = await apiClient.post('/api/tbt/', payload);
        console.log('[TBT] Create response:', res.data);
        message.success('TBT created successfully');
      }
      onSuccess(res.data);
    } catch (err: any) {
      console.error('[TBT] Submit error:', err.response?.data || err.message);
      const errData = err.response?.data;
      if (errData && typeof errData === 'object') {
        const msgs = Object.entries(errData)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
          .join('\n');
        message.error(`Validation error:\n${msgs}`);
      } else {
        message.error('Failed to save TBT. Please check all required fields.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spin style={{ display: 'block', margin: '40px auto' }} />;

  const isParticipantSelected = (p: Participant) =>
    selectedParticipants.some(x => x.id === p.id && x.participant_type === p.participant_type);

  return (
    <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark>
      {/* ── Basic Info ── */}
      <Card title="Basic Information" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col xs={24} md={16}>
            <Form.Item label="TBT Title" name="title" rules={[{ required: true, message: 'Title is required' }]}>
              <Input placeholder="Enter TBT title" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Status" name="status" initialValue="draft">
              <Select>
                <Select.Option value="draft">Draft</Select.Option>
                <Select.Option value="scheduled">Scheduled</Select.Option>
                <Select.Option value="live">Live</Select.Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item label="Date" name="date" rules={[{ required: true, message: 'Date is required' }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Start Time" name="start_time">
              <TimePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="End Time" name="end_time">
              <TimePicker format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item label="Location" name="location" rules={[{ required: true, message: 'Location is required' }]}>
              <Input placeholder="Meeting location" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="Work Area" name="work_area">
              <Input placeholder="Specific work area" />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item label="Conducted By" name="conducted_by" rules={[{ required: true, message: 'Required' }]}>
              <Input placeholder="Name of conductor" />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Duration" name="duration" initialValue={30}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item label="Duration Unit" name="duration_unit" initialValue="minutes">
              <Select>
                <Select.Option value="minutes">Minutes</Select.Option>
                <Select.Option value="hours">Hours</Select.Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item label="Training Type" name="training_type" initialValue="toolbox_training">
              <Select>
                <Select.Option value="toolbox_training">Toolbox Training</Select.Option>
                <Select.Option value="safety_training">Safety Training</Select.Option>
                <Select.Option value="job_training">Job Training</Select.Option>
                <Select.Option value="induction_training">Induction Training</Select.Option>
                <Select.Option value="inspection_training">Inspection Training</Select.Option>
              </Select>
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item label="Description" name="description">
              <TextArea rows={2} placeholder="Brief description" />
            </Form.Item>
          </Col>
        </Row>
      </Card>

      {/* ── Discussion Points ── */}
      <Card
        title="Discussion Points"
        style={{ marginBottom: 16 }}
        extra={
          <Button size="small" icon={<PlusOutlined />} onClick={addDiscussionPoint}>
            Add Point
          </Button>
        }
      >
        {discussionPoints.map((dp, idx) => (
          <div key={idx} style={{ marginBottom: 12, padding: '12px', background: '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0' }}>
            <Row gutter={8} align="middle">
              <Col xs={24} md={6}>
                <Select
                  value={dp.type}
                  onChange={v => updateDiscussionPoint(idx, 'type', v)}
                  style={{ width: '100%' }}
                  size="small"
                >
                  {DISCUSSION_TYPES.map(t => (
                    <Select.Option key={t.value} value={t.value}>{t.label}</Select.Option>
                  ))}
                </Select>
              </Col>
              <Col xs={22} md={17}>
                <TextArea
                  value={dp.content}
                  onChange={e => updateDiscussionPoint(idx, 'content', e.target.value)}
                  placeholder={`Enter ${DISCUSSION_TYPES.find(t => t.value === dp.type)?.label || 'discussion'} details...`}
                  rows={2}
                  size="small"
                />
              </Col>
              <Col xs={2} md={1}>
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  size="small"
                  onClick={() => removeDiscussionPoint(idx)}
                />
              </Col>
            </Row>
          </div>
        ))}
        {discussionPoints.length === 0 && (
          <div style={{ textAlign: 'center', color: '#999', padding: '16px 0' }}>
            No discussion points added. Click "Add Point" to start.
          </div>
        )}
      </Card>

      {/* ── Participants ── */}
      <Card title="Participants" style={{ marginBottom: 16 }}>
        {/* Selected participants */}
        {selectedParticipants.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 6, fontWeight: 500, color: '#555' }}>
              Selected ({selectedParticipants.length}):
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selectedParticipants.map(p => (
                <Tag
                  key={`${p.participant_type}-${p.id}`}
                  closable
                  onClose={() => removeParticipant(p)}
                  color={p.participant_type === 'user' ? 'blue' : 'green'}
                >
                  {p.name} {p.department ? `(${p.department})` : ''}
                </Tag>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <Input
          prefix={<SearchOutlined />}
          placeholder="Search employees, admins, workers by name or department..."
          value={participantSearch}
          onChange={e => setParticipantSearch(e.target.value)}
          style={{ marginBottom: 8 }}
          allowClear
        />

        {searchLoading && <Spin size="small" style={{ display: 'block', margin: '8px auto' }} />}

        {searchResults.length > 0 && (
          <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 6 }}>
            {searchResults.map(p => {
              const key = `${p.participant_type}-${p.id}`;
              const selected = isParticipantSelected(p);
              return (
                <div
                  key={key}
                  onClick={() => toggleParticipant(p)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    background: selected ? '#e6f7ff' : '#fff',
                    borderBottom: '1px solid #f5f5f5',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Checkbox checked={selected} onChange={() => toggleParticipant(p)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>
                      {p.designation || p.department || p.email}
                      {' '}
                      <Tag color={p.participant_type === 'user' ? 'blue' : 'green'} style={{ fontSize: 10 }}>
                        {p.participant_type}
                      </Tag>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {participantSearch && !searchLoading && searchResults.length === 0 && (
          <div style={{ textAlign: 'center', color: '#999', padding: '12px 0' }}>
            No participants found for "{participantSearch}"
          </div>
        )}

        {!participantSearch && (
          <div style={{ color: '#aaa', fontSize: 13, marginTop: 4 }}>
            <UserAddOutlined /> Type a name to search and add participants
          </div>
        )}
      </Card>

      {/* ── Actions ── */}
      <div style={{ textAlign: 'right' }}>
        <Space>
          <Button onClick={onCancel} icon={<CloseOutlined />} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="primary"
            htmlType="submit"
            icon={<SaveOutlined />}
            loading={submitting}
            onClick={() => console.log('[TBT] Save button clicked')}
          >
            {tbtId ? 'Update TBT' : 'Create TBT'}
          </Button>
        </Space>
      </div>
    </Form>
  );
};

export default TBTForm;
