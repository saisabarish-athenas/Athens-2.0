import React, { useState, useEffect, useMemo } from 'react';
import { Card, Row, Col, Statistic, Select, Spin, Tag, List as AntList, Button } from 'antd';
import { SafetyOutlined, ClockCircleOutlined, CheckCircleOutlined, TeamOutlined, CalendarOutlined } from '@ant-design/icons';
import { apiClient } from '../../lib/api';
import { getTrainingTypeMeta, TRAINING_TYPES } from './trainingTypes';

const { Option } = Select;

const TrainingLanding: React.FC = () => {
  const [trainings, setTrainings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState('30');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    setLoading(true);
    apiClient.get('/api/tbt/list/')
      .then(res => {
        const data = res.data?.results ?? res.data;
        const mappedData = Array.isArray(data) ? data.map((training: any) => ({
          ...training,
          training_type: training.training_type || training.trainingType || 'toolbox_training',
          trainingType: training.trainingType || training.training_type || 'toolbox_training',
        })) : [];
        console.log('[TrainingLanding] fetched list values:', mappedData.map((training: any) => ({
          id: training.id,
          training_type: training.training_type,
          trainingType: training.trainingType,
        })));
        setTrainings(mappedData);
      })
      .catch(() => setTrainings([]))
      .finally(() => setLoading(false));
  }, []);

  const metrics = useMemo(() => {
    const filteredTrainings = trainings.filter(training => {
      if (typeFilter !== 'all' && training.training_type !== typeFilter) return false;
      if (!training.date) return true;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - Number(dateRange));
      return new Date(training.date) >= cutoff;
    });

    return {
      total: filteredTrainings.length,
      byType: TRAINING_TYPES.reduce<Record<string, number>>((acc, type) => {
        acc[type.value] = filteredTrainings.filter(training => training.training_type === type.value).length;
        return acc;
      }, {}),
      completed: filteredTrainings.filter(training => training.status === 'completed').length,
      upcoming: filteredTrainings.filter(training => training.status === 'planned').length,
      totalAttendees: filteredTrainings.reduce((sum, training) => (
        sum + (training.attendance_records?.length || 0)
      ), 0),
    };
  }, [dateRange, trainings, typeFilter]);

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <p style={{ margin: 0, color: '#8c8c8c' }}>Track inspection, job, induction, safety, and toolbox training sessions</p>
      </div>

      {/* Filters */}
      <Card style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Period:</span>
            <Select value={dateRange} onChange={setDateRange} style={{ width: 150 }}>
              <Option value="7">Last 7 days</Option>
              <Option value="30">Last 30 days</Option>
              <Option value="90">Last 90 days</Option>
            </Select>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Type:</span>
            <Select value={typeFilter} onChange={setTypeFilter} style={{ width: 150 }}>
              <Option value="all">All</Option>
              {TRAINING_TYPES.map(type => (
                <Option key={type.value} value={type.value}>{type.label}</Option>
              ))}
            </Select>
          </div>
          
          {typeFilter !== 'all' && (
            <Button type="link" onClick={() => setTypeFilter('all')}>Clear Filters</Button>
          )}
        </div>
      </Card>

      {/* KPI Cards */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Trainings"
              value={metrics.total}
              prefix={<SafetyOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Inspection Training"
              value={metrics.byType.inspection_training || 0}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#13c2c2' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Job Training"
              value={metrics.byType.job_training || 0}
              prefix={<CalendarOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Completed"
              value={metrics.completed}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        {TRAINING_TYPES.filter(type => !['inspection_training', 'job_training'].includes(type.value)).map(type => (
          <Col xs={24} sm={12} md={6} key={type.value}>
            <Card>
              <Statistic
                title={type.label}
                value={metrics.byType[type.value] || 0}
                prefix={<SafetyOutlined />}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Upcoming"
              value={metrics.upcoming}
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Attendees"
              value={metrics.totalAttendees}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      {trainings.length > 0 && (
        <Card title="Recent Training Types" style={{ marginTop: '24px' }}>
          <AntList
            dataSource={trainings.slice(0, 5)}
            renderItem={(training: any) => {
              const meta = getTrainingTypeMeta(training.training_type);
              return (
                <AntList.Item>
                  <span>{training.title}</span>
                  <Tag color={meta.color}>{meta.label}</Tag>
                </AntList.Item>
              );
            }}
          />
        </Card>
      )}

      {/* Empty State */}
      {trainings.length === 0 && !loading && (
        <Card style={{ textAlign: 'center', marginTop: '24px' }}>
          <SafetyOutlined style={{ fontSize: '64px', color: '#8c8c8c', marginBottom: '16px' }} />
          <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>No Trainings Yet</h3>
          <p style={{ color: '#8c8c8c', marginBottom: '24px' }}>Get started by creating your first training session</p>
        </Card>
      )}
    </div>
  );
};

export default TrainingLanding;
