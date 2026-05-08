import React, { useState, useEffect } from 'react';
import { Table, Button, Input, Select, Tag, Row, Col, Space } from 'antd';
import { SearchOutlined, EditOutlined, ReloadOutlined } from '@ant-design/icons';
import { apiClient } from '../../../lib/api';
import { getTrainingTypeMeta, TRAINING_TYPES } from '../trainingTypes';

const { Option } = Select;

interface TrainingListProps {
  onView?: (training: any) => void;
  onEdit?: (training: any) => void;
  refreshKey?: number;
}

const TrainingList: React.FC<TrainingListProps> = ({ onView, onEdit, refreshKey }) => {
  const [trainings, setTrainings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const fetchTrainings = () => {
    setLoading(true);
    apiClient.get('/api/tbt/list/')
      .then(res => {
        const data = res.data?.results ?? res.data;
        // Map API fields to expected frontend fields
        const mappedData = Array.isArray(data) ? data.map((training: any) => ({
          ...training,
          training_type: training.training_type || training.trainingType || 'toolbox_training',
          trainingType: training.trainingType || training.training_type || 'toolbox_training',
          trainer: training.conducted_by,
          training_date: training.date,
          attendees: training.attendance_records?.length || 0,
        })) : [];
        console.log('[TrainingList] fetched training values:', mappedData.map((training: any) => ({
          id: training.id,
          training_type: training.training_type,
          trainingType: training.trainingType,
          title: training.title,
        })));
        setTrainings(mappedData);
      })
      .catch(() => setTrainings([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTrainings(); }, [refreshKey]);

  const columns = [
    {
      title: 'Training ID',
      dataIndex: 'id',
      key: 'id',
      render: (text: string) => (
        <span style={{ fontWeight: 'bold', color: '#1890ff' }}>{text}</span>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'training_type',
      key: 'training_type',
      render: (type: string) => {
        const meta = getTrainingTypeMeta(type);
        return (
        <Tag color={meta.color}>
          {meta.label}
        </Tag>
        );
      },
    },
    {
      title: 'Title',
      dataIndex: 'title',
      key: 'title',
    },
    {
      title: 'Date',
      dataIndex: 'training_date',
      key: 'training_date',
    },
    {
      title: 'Trainer',
      dataIndex: 'trainer',
      key: 'trainer',
    },
    {
      title: 'Location',
      dataIndex: 'location',
      key: 'location',
    },
    {
      title: 'Attendees',
      dataIndex: 'attendees',
      key: 'attendees',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const colors: any = {
          planned: 'processing',
          completed: 'success',
          cancelled: 'error'
        };
        const labels: any = {
          planned: 'Planned',
          completed: 'Completed',
          cancelled: 'Cancelled'
        };
        return <Tag color={colors[status] || 'default'}>{labels[status] || status}</Tag>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: any) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            onClick={() => onView?.(record)}
          >
            View
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => onEdit?.(record)}
          >
            Edit
          </Button>
        </Space>
      ),
    },
  ];

  const filtered = trainings.filter(t => {
    const matchSearch = !searchText ||
      t.title?.toLowerCase().includes(searchText.toLowerCase()) ||
      t.conducted_by?.toLowerCase().includes(searchText.toLowerCase()) ||
      t.location?.toLowerCase().includes(searchText.toLowerCase());
    const matchType = !typeFilter || t.training_type === typeFilter;
    return matchSearch && matchType;
  });

  return (
    <div>
      <div style={{ marginBottom: 16, padding: '16px', backgroundColor: '#fff', borderRadius: '8px' }}>
        <Row gutter={16} align="middle">
          <Col xs={24} sm={8} md={6}>
            <Input
              placeholder="Search trainings"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              prefix={<SearchOutlined />}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={8} md={4}>
            <Select
              placeholder="Filter by type"
              allowClear
              style={{ width: '100%' }}
              value={typeFilter}
              onChange={(value) => setTypeFilter(value)}
            >
              {TRAINING_TYPES.map(type => (
                <Option key={type.value} value={type.value}>{type.label}</Option>
              ))}
            </Select>
          </Col>
          <Col>
            <Button icon={<ReloadOutlined />} onClick={fetchTrainings} loading={loading}>Refresh</Button>
          </Col>
        </Row>
      </div>

      <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '16px' }}>
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          loading={loading}
          scroll={{ x: 'max-content', y: 'calc(100vh - 300px)' }}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} trainings`,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          size="middle"
        />
      </div>
    </div>
  );
};

export default TrainingList;
