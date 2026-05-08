import React from 'react';
import { Card, Typography, Row, Col, Progress, Tag, Statistic } from 'antd';
import { 
  CheckCircleOutlined, 
  ClockCircleOutlined,
  UserOutlined,
  TeamOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;

interface Participant {
  id: number;
  name: string;
  email: string;
  status: 'accepted' | 'pending' | 'noresponse' | string;
  attended: boolean;
}

interface MomWorkflowSummaryProps {
  participants: Participant[];
  meetingStatus: 'scheduled' | 'live' | 'completed' | 'cancelled';
  meetingDateTime: string;
  title: string;
}

const MomWorkflowSummary: React.FC<MomWorkflowSummaryProps> = ({
  participants,
  meetingStatus,
  meetingDateTime,
  title
}) => {
  // Memoized participant statistics calculation to avoid repeated calculations
  const participantStats = React.useMemo(() => {
    const acceptedCount = participants.filter(p => p.status === 'accepted').length;
    const noResponseCount = participants.filter(p => p.status !== 'accepted').length;
    const totalParticipants = participants.length;
    
    return {
      acceptedCount,
      noResponseCount,
      totalParticipants
    };
  }, [participants]);
  
  const { acceptedCount, noResponseCount, totalParticipants } = participantStats;
  
  // Calculate acceptance rate
  const acceptanceRate = totalParticipants > 0 
    ? Math.round((acceptedCount / totalParticipants) * 100)
    : 0;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'blue';
      case 'live': return 'green';
      case 'completed': return 'default';
      case 'cancelled': return 'red';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'accepted': return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'pending':
      case 'noresponse': return <ClockCircleOutlined style={{ color: '#faad14' }} />;
      default: return <UserOutlined />;
    }
  };

  return (
    <Card 
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Meeting Workflow Summary</span>
          <Tag color={getStatusColor(meetingStatus)} style={{ textTransform: 'uppercase' }}>
            {meetingStatus}
          </Tag>
        </div>
      }
      style={{ marginBottom: 24 }}
    >
      <Row gutter={[16, 16]}>
        {/* Meeting Info */}
        <Col xs={24} md={12}>
          <Title level={5}>Meeting Information</Title>
          <Text strong>{title}</Text>
          <br />
          <Text type="secondary">
            {new Date(meetingDateTime).toLocaleString()}
          </Text>
        </Col>

        {/* Response Statistics */}
        <Col xs={24} md={12}>
          <Title level={5}>Response Statistics</Title>
          <Statistic
            title="Acceptance Rate"
            value={acceptanceRate}
            suffix="%"
            styles={{ content: { color: acceptanceRate >= 70 ? '#3f8600' : acceptanceRate >= 50 ? '#faad14' : '#cf1322' } }}
          />
        </Col>

        {/* Participant Breakdown */}
        <Col xs={24}>
          <Title level={5}>Participant Status Breakdown</Title>
          <Row gutter={[16, 8]}>
            <Col xs={12} sm={6}>
              <Card size="small" style={{ textAlign: 'center', backgroundColor: '#f6ffed' }}>
                <CheckCircleOutlined style={{ fontSize: '24px', color: '#52c41a', marginBottom: 8 }} />
                <div>
                  <Text strong style={{ color: '#52c41a' }}>{acceptedCount}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: '12px' }}>Accepted</Text>
                </div>
              </Card>
            </Col>
            
            <Col xs={12} sm={6}>
              <Card size="small" style={{ textAlign: 'center', backgroundColor: '#fffbf0' }}>
                <ClockCircleOutlined style={{ fontSize: '24px', color: '#faad14', marginBottom: 8 }} />
                <div>
                  <Text strong style={{ color: '#faad14' }}>{noResponseCount}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: '12px' }}>No Response</Text>
                </div>
              </Card>
            </Col>
            
            <Col xs={12} sm={6}>
              <Card size="small" style={{ textAlign: 'center', backgroundColor: '#f0f5ff' }}>
                <TeamOutlined style={{ fontSize: '24px', color: '#1890ff', marginBottom: 8 }} />
                <div>
                  <Text strong style={{ color: '#1890ff' }}>{totalParticipants}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: '12px' }}>Total Invited</Text>
                </div>
              </Card>
            </Col>
          </Row>
        </Col>

        {/* Progress Bar */}
        <Col xs={24}>
          <Title level={5}>Response Progress</Title>
          <Progress
            percent={acceptanceRate}
            strokeColor={{
              '0%': '#faad14',
              '100%': '#52c41a',
            }}
            format={(percent) => `${percent}% accepted`}
          />
          <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
            {acceptedCount} accepted • {noResponseCount} no response
          </div>
        </Col>

        {/* Workflow Status */}
        <Col xs={24}>
          <Title level={5}>Workflow Status</Title>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <Tag color="blue" icon={<UserOutlined />}>
              Invitations Sent: {totalParticipants}
            </Tag>
            <Tag color={acceptanceRate >= 70 ? 'green' : 'orange'} icon={<CheckCircleOutlined />}>
              Acceptance Rate: {acceptanceRate}%
            </Tag>
            {meetingStatus === 'live' && (
              <Tag color="green" icon={<CheckCircleOutlined />}>
                Meeting In Progress
              </Tag>
            )}
            {meetingStatus === 'completed' && (
              <Tag color="default" icon={<CheckCircleOutlined />}>
                Meeting Completed
              </Tag>
            )}
          </div>
        </Col>
      </Row>
    </Card>
  );
};

export { MomWorkflowSummary as default };
