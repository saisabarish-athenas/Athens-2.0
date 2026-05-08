import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Space, Input, Tag, Tooltip, Popconfirm, message } from 'antd';
import {
  EyeOutlined, EditOutlined, SearchOutlined,
  CheckCircleOutlined, FileProtectOutlined, ReloadOutlined,
} from '@ant-design/icons';
import apiClient from '../../../lib/api';

interface TBTListProps {
  onView: (tbt: any) => void;
  onEdit: (tbt: any) => void;
  onComplete?: (tbt: any) => void;
  refreshTrigger?: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'default',
  scheduled: 'blue',
  live: 'orange',
  completed: 'green',
  ptw_generated: 'purple',
  cancelled: 'red',
  planned: 'blue',
};

const TBTList: React.FC<TBTListProps> = ({ onView, onEdit, onComplete, refreshTrigger }) => {
  const [tbts, setTbts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [generatingPtw, setGeneratingPtw] = useState<number | null>(null);

  const fetchTbts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/tbt/');
      const data = res.data;
      setTbts(Array.isArray(data) ? data : data.results || []);
    } catch (err: any) {
      console.error('[TBT] List fetch error:', err.response?.data || err.message);
      message.error('Failed to load TBT list');
      setTbts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTbts(); }, [fetchTbts, refreshTrigger]);

  const handleGeneratePtw = async (tbt: any) => {
    setGeneratingPtw(tbt.id);
    try {
      const res = await apiClient.post(`/api/tbt/${tbt.id}/generate_ptw/`);
      message.success(`PTW ${res.data.permit_number} generated successfully!`);
      fetchTbts();
    } catch (err: any) {
      const errMsg = err.response?.data?.error || 'PTW generation failed';
      message.error(errMsg);
    } finally {
      setGeneratingPtw(null);
    }
  };

  const filtered = tbts.filter(t =>
    !searchText ||
    (t.title || '').toLowerCase().includes(searchText.toLowerCase()) ||
    (t.location || '').toLowerCase().includes(searchText.toLowerCase()) ||
    (t.conducted_by || '').toLowerCase().includes(searchText.toLowerCase())
  );

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
      render: (v: string, record: any) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => onView(record)}>
          {v || '—'}
        </Button>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      width: 110,
    },
    {
      title: 'Location',
      dataIndex: 'location',
      key: 'location',
      width: 140,
      ellipsis: true,
    },
    {
      title: 'Conducted By',
      dataIndex: 'conducted_by',
      key: 'conducted_by',
      width: 140,
      ellipsis: true,
    },
    {
      title: 'Participants',
      key: 'participants',
      width: 100,
      render: (_: any, record: any) => {
        const count = record.user_participants_details?.length || 0;
        const att = record.attendance_count || 0;
        return <span>{count} invited / {att} attended</span>;
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (s: string) => (
        <Tag color={STATUS_COLORS[s] || 'default'}>
          {(s || 'draft').replace('_', ' ').toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'PTW',
      key: 'ptw',
      width: 80,
      render: (_: any, record: any) =>
        record.generated_ptw_id ? (
          <Tag color="purple">#{record.generated_ptw_id}</Tag>
        ) : '—',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_: any, record: any) => (
        <Space size={4}>
          <Tooltip title="View">
            <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => onView(record)} />
          </Tooltip>
          {!['completed', 'ptw_generated', 'cancelled'].includes(record.status) && (
            <Tooltip title="Edit">
              <Button type="link" size="small" icon={<EditOutlined />} onClick={() => onEdit(record)} />
            </Tooltip>
          )}
          {record.status !== 'completed' && record.status !== 'ptw_generated' && record.status !== 'cancelled' && onComplete && (
            <Tooltip title="Complete TBT">
              <Button
                type="link"
                size="small"
                icon={<CheckCircleOutlined />}
                style={{ color: '#52c41a' }}
                onClick={() => onComplete(record)}
              />
            </Tooltip>
          )}
          {record.status === 'completed' && !record.generated_ptw_id && (
            <Tooltip title="Generate PTW">
              <Popconfirm
                title="Generate PTW from this TBT?"
                description="This will auto-create a PTW pre-filled with TBT data."
                onConfirm={() => handleGeneratePtw(record)}
                okText="Generate"
              >
                <Button
                  type="link"
                  size="small"
                  icon={<FileProtectOutlined />}
                  style={{ color: '#722ed1' }}
                  loading={generatingPtw === record.id}
                />
              </Popconfirm>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px', background: '#fff' }}>
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Input
          placeholder="Search by title, location, conductor..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          style={{ width: 320 }}
          allowClear
        />
        <Button icon={<ReloadOutlined />} onClick={fetchTbts} loading={loading}>
          Refresh
        </Button>
        <span style={{ color: '#888', fontSize: 13 }}>{filtered.length} records</span>
      </div>
      <Table
        columns={columns}
        dataSource={filtered}
        loading={loading}
        rowKey="id"
        pagination={{ pageSize: 15, showSizeChanger: true }}
        size="small"
      />
    </div>
  );
};

export default TBTList;
