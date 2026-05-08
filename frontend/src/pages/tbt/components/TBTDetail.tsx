import React, { useState } from 'react';
import {
  Card, Descriptions, Tag, Button, Space, Divider, List, Avatar,
  Input, Modal, message, Popconfirm, Typography, Row, Col, Badge,
} from 'antd';
import {
  CheckCircleOutlined, FileProtectOutlined, UserOutlined,
  ArrowLeftOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons';
import apiClient from '../../../lib/api';

const { TextArea } = Input;
const { Text, Title } = Typography;

const STATUS_COLORS: Record<string, string> = {
  draft: 'default',
  scheduled: 'blue',
  live: 'orange',
  completed: 'green',
  ptw_generated: 'purple',
  cancelled: 'red',
};

const DISCUSSION_LABELS: Record<string, string> = {
  work_description: 'Work Description',
  hazard: 'Hazard Identification',
  precautions: 'Safety Precautions',
  ppe: 'PPE Requirements',
  emergency: 'Emergency Instructions',
  general: 'General Notes',
};

interface TBTDetailProps {
  tbt: any;
  onBack: () => void;
  onEdit: (tbt: any) => void;
  onRefresh: (tbt: any) => void;
}

const TBTDetail: React.FC<TBTDetailProps> = ({ tbt, onBack, onEdit, onRefresh }) => {
  const [completing, setCompleting] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [generatingPtw, setGeneratingPtw] = useState(false);

  const canComplete = !['completed', 'ptw_generated', 'cancelled'].includes(tbt.status);
  const canGeneratePtw = tbt.status === 'completed' && !tbt.generated_ptw_id;

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const res = await apiClient.post(`/api/tbt/${tbt.id}/complete/`, {
        completion_notes: completionNotes,
        discussion_points: tbt.discussion_points,
      });
      message.success('TBT completed successfully!');
      setShowCompleteModal(false);
      onRefresh(res.data.tbt);
    } catch (err: any) {
      const errMsg = err.response?.data?.error || 'Failed to complete TBT';
      message.error(errMsg);
    } finally {
      setCompleting(false);
    }
  };

  const handleGeneratePtw = async () => {
    setGeneratingPtw(true);
    try {
      const res = await apiClient.post(`/api/tbt/${tbt.id}/generate_ptw/`);
      message.success(`PTW ${res.data.permit_number} generated! Redirecting to PTW module...`);
      // Refresh TBT data
      const refreshed = await apiClient.get(`/api/tbt/${tbt.id}/`);
      onRefresh(refreshed.data);
    } catch (err: any) {
      const errMsg = err.response?.data?.error || 'PTW generation failed';
      message.error(errMsg);
    } finally {
      setGeneratingPtw(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={onBack}>Back</Button>
          <Title level={4} style={{ margin: 0 }}>{tbt.title}</Title>
          <Tag color={STATUS_COLORS[tbt.status] || 'default'}>
            {(tbt.status || 'draft').replace('_', ' ').toUpperCase()}
          </Tag>
        </Space>
        <Space>
          {canComplete && (
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              style={{ background: '#52c41a', borderColor: '#52c41a' }}
              onClick={() => setShowCompleteModal(true)}
            >
              Complete TBT
            </Button>
          )}
          {canGeneratePtw && (
            <Button
              type="primary"
              icon={<FileProtectOutlined />}
              style={{ background: '#722ed1', borderColor: '#722ed1' }}
              loading={generatingPtw}
              onClick={handleGeneratePtw}
            >
              Generate PTW
            </Button>
          )}
          {tbt.generated_ptw_id && (
            <Tag color="purple" style={{ padding: '4px 8px', fontSize: 13 }}>
              <FileProtectOutlined /> PTW #{tbt.generated_ptw_id} Generated
            </Tag>
          )}
          {canComplete && (
            <Button icon={<CheckCircleOutlined />} onClick={() => onEdit(tbt)}>
              Edit
            </Button>
          )}
        </Space>
      </div>

      <Row gutter={16}>
        {/* Left: Details */}
        <Col xs={24} lg={14}>
          <Card title="TBT Details" style={{ marginBottom: 16 }}>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="Date">{tbt.date}</Descriptions.Item>
              <Descriptions.Item label="Location">{tbt.location}</Descriptions.Item>
              <Descriptions.Item label="Work Area">{tbt.work_area || '—'}</Descriptions.Item>
              <Descriptions.Item label="Conducted By">{tbt.conducted_by}</Descriptions.Item>
              <Descriptions.Item label="Start Time">{tbt.start_time || '—'}</Descriptions.Item>
              <Descriptions.Item label="End Time">{tbt.end_time || '—'}</Descriptions.Item>
              <Descriptions.Item label="Duration">
                {tbt.duration} {tbt.duration_unit}
              </Descriptions.Item>
              <Descriptions.Item label="Training Type">
                {(tbt.training_type || '').replace('_', ' ')}
              </Descriptions.Item>
              {tbt.description && (
                <Descriptions.Item label="Description" span={2}>
                  {tbt.description}
                </Descriptions.Item>
              )}
              {tbt.completed_at && (
                <Descriptions.Item label="Completed At" span={2}>
                  {new Date(tbt.completed_at).toLocaleString()}
                </Descriptions.Item>
              )}
              {tbt.completion_notes && (
                <Descriptions.Item label="Completion Notes" span={2}>
                  {tbt.completion_notes}
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>

          {/* Discussion Points */}
          {tbt.discussion_points?.length > 0 && (
            <Card title="Discussion Points" style={{ marginBottom: 16 }}>
              {tbt.discussion_points.map((dp: any, idx: number) => (
                <div key={idx} style={{ marginBottom: 12 }}>
                  <Tag color="blue" style={{ marginBottom: 4 }}>
                    {DISCUSSION_LABELS[dp.type] || dp.type}
                  </Tag>
                  <div style={{
                    padding: '8px 12px',
                    background: '#fafafa',
                    borderRadius: 4,
                    border: '1px solid #f0f0f0',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {dp.content}
                  </div>
                </div>
              ))}
            </Card>
          )}
        </Col>

        {/* Right: Participants & Attendance */}
        <Col xs={24} lg={10}>
          <Card
            title={`Participants (${tbt.user_participants_details?.length || 0})`}
            style={{ marginBottom: 16 }}
          >
            {tbt.user_participants_details?.length > 0 ? (
              <List
                size="small"
                dataSource={tbt.user_participants_details}
                renderItem={(p: any) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={<Avatar icon={<UserOutlined />} size="small" />}
                      title={p.full_name || p.name || p.username}
                      description={[p.designation, p.department].filter(Boolean).join(' · ')}
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Text type="secondary">No participants added</Text>
            )}
          </Card>

          <Card title={`Attendance (${tbt.attendance_count || 0} present)`}>
            {tbt.attendance_records?.length > 0 ? (
              <List
                size="small"
                dataSource={tbt.attendance_records}
                renderItem={(a: any) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={<Avatar icon={<UserOutlined />} size="small" />}
                      title={a.worker_name}
                      description={
                        <Tag color={a.status === 'present' ? 'green' : 'red'} style={{ fontSize: 11 }}>
                          {a.status?.toUpperCase()}
                        </Tag>
                      }
                    />
                  </List.Item>
                )}
              />
            ) : (
              <Text type="secondary">No attendance records</Text>
            )}
          </Card>
        </Col>
      </Row>

      {/* Complete Modal */}
      <Modal
        title={<Space><CheckCircleOutlined style={{ color: '#52c41a' }} /> Complete TBT</Space>}
        open={showCompleteModal}
        onCancel={() => setShowCompleteModal(false)}
        footer={[
          <Button key="cancel" onClick={() => setShowCompleteModal(false)}>Cancel</Button>,
          <Button
            key="complete"
            type="primary"
            loading={completing}
            style={{ background: '#52c41a', borderColor: '#52c41a' }}
            onClick={handleComplete}
          >
            Confirm Completion
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 12 }}>
          <ExclamationCircleOutlined style={{ color: '#faad14', marginRight: 8 }} />
          This will mark the TBT as completed and lock editing.
          You can then generate a PTW from the completed TBT.
        </div>
        <div style={{ marginBottom: 8, fontWeight: 500 }}>Completion Notes (optional):</div>
        <TextArea
          rows={4}
          value={completionNotes}
          onChange={e => setCompletionNotes(e.target.value)}
          placeholder="Enter any final notes, observations, or summary..."
        />
      </Modal>
    </div>
  );
};

export default TBTDetail;
