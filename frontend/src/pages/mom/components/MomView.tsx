import React, { useState, useEffect } from 'react';
import { Card, Typography, Spin, List, App } from 'antd';
import { useParams } from 'react-router-dom';
import api from '../../../lib/api';
import { useTheme } from '../../../contexts/ThemeContext';
import PageLayout from '../../../components/ui/PageLayout';

const { Title, Paragraph } = Typography;

interface Mom {
  id: number;
  title: string;
  agenda: string;
  meeting_datetime: string;
  scheduled_by: number;
  participants: Array<{
    id: number;
    name: string;
    email: string;
  }>;
}

const MomView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [mom, setMom] = useState<Mom | null>(null);
  const [loading, setLoading] = useState(true);
  const { message: antdMessage } = App.useApp();
  const { effectiveTheme } = useTheme();

  const { message } = App.useApp();

  useEffect(() => {
    const fetchMom = async () => {
      if (!id) return;
      setLoading(true);
      try {
        const response = await api.get(`/api/v1/mom/${id}/`);
        setMom(response.data);
      } catch (error) {
        antdMessage.error('Failed to load meeting details.');
      } finally {
        setLoading(false);
      }
    };
    fetchMom();
  }, [id]);

  if (loading) {
    return (
      <PageLayout
        title="Meeting Details"
        subtitle="View meeting information"
        breadcrumbs={[
          { title: 'MOM', href: '/app/mom' },
          { title: 'View Meeting' }
        ]}
      >
        <div className="flex justify-center items-center min-h-64">
          <Spin description="Loading meeting details..." size="large" />
        </div>
      </PageLayout>
    );
  }

  if (!mom) {
    return (
      <PageLayout
        title="Meeting Details"
        subtitle="Meeting not found"
        breadcrumbs={[
          { title: 'MOM', href: '/app/mom' },
          { title: 'View Meeting' }
        ]}
      >
        <Card className={`theme-card ${effectiveTheme === 'dark' ? 'dark-theme' : 'light-theme'}`}>
          <Title level={4}>Meeting Not Found</Title>
          <Paragraph>The requested meeting could not be found.</Paragraph>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={mom.title}
      subtitle="Meeting details and participants"
      breadcrumbs={[
        { title: 'MOM', href: '/app/mom' },
        { title: 'View Meeting' }
      ]}
    >
      <Card
        className={`theme-card ${effectiveTheme === 'dark' ? 'dark-theme' : 'light-theme'}`}
        variant="borderless"
      >
      <Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>
        Meeting Details
      </Title>
      <Paragraph>
        <strong>Title:</strong> {mom.title}
      </Paragraph>
      <Paragraph>
        <strong>Agenda:</strong> {mom.agenda}
      </Paragraph>
      <Paragraph>
        <strong>Meeting Date & Time:</strong> {new Date(mom.meeting_datetime).toLocaleString()}
      </Paragraph>
      <Paragraph>
        <strong>Participants:</strong>
      </Paragraph>
      <List
        dataSource={mom.participants}
        renderItem={participant => (
          <List.Item key={participant.id}>
            {participant.name} ({participant.email})
          </List.Item>
        )}
        locale={{ emptyText: 'No participants' }}
      />
      </Card>
    </PageLayout>
  );
};

export default MomView;
