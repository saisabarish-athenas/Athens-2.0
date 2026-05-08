import React, { useEffect, useState } from 'react';
import { Form, Input, Select, DatePicker, Button, Card, Row, Col, Space, message } from 'antd';
import { apiClient } from '../../../lib/api';
import dayjs from 'dayjs';
import { DEFAULT_TRAINING_TYPE, TRAINING_TYPES } from '../trainingTypes';

const { Option } = Select;
const { TextArea } = Input;

interface TrainingFormProps {
  trainingId?: number | null;
  initialTraining?: any | null;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const TrainingForm: React.FC<TrainingFormProps> = ({ trainingId, initialTraining, onSuccess, onCancel }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [trainingType, setTrainingType] = useState<string>(DEFAULT_TRAINING_TYPE);

  useEffect(() => {
    if (!initialTraining) {
      form.resetFields();
      setTrainingType(DEFAULT_TRAINING_TYPE);
      return;
    }

    const selectedType = initialTraining.trainingType || initialTraining.training_type || DEFAULT_TRAINING_TYPE;
    setTrainingType(selectedType);
    form.setFieldsValue({
      training_type: selectedType,
      title: initialTraining.title,
      training_date: initialTraining.training_date ? dayjs(initialTraining.training_date) : null,
      trainer: initialTraining.trainer || initialTraining.conducted_by,
      location: initialTraining.location,
      description: initialTraining.description,
      job_role: initialTraining.job_role,
    });
    console.log('[TrainingForm] edit loaded training type:', selectedType, initialTraining);
  }, [form, initialTraining]);

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const selectedTrainingType = values.training_type;
      const payload = {
        trainingType: selectedTrainingType,
        // Map frontend fields to TBT API fields
        title: values.title,
        conducted_by: values.trainer,
        location: values.location,
        date: values.training_date?.format('YYYY-MM-DD'),
        description: values.description || '',
        job_role: values.job_role,
        // status is not included - backend will apply default='planned'
      };
      console.log('[TrainingForm] selected training type:', selectedTrainingType);
      console.log('[TrainingForm] submitted payload:', payload);
      console.log('[TrainingForm] API request body:', JSON.stringify(payload));
      if (trainingId) {
        await apiClient.patch(`/api/tbt/update/${trainingId}/`, payload);
        message.success('Training updated successfully');
      } else {
        await apiClient.post('/api/tbt/create/', payload);
        message.success('Training created successfully');
      }
      form.resetFields();
      onSuccess?.();
    } catch (error: any) {
      const data = error?.response?.data;
      const msg = typeof data === 'object'
        ? Object.entries(data).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' | ')
        : 'Failed to save training.';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{ training_type: DEFAULT_TRAINING_TYPE }}
      >
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              name="training_type"
              label="Training Type"
              rules={[{ required: true, message: 'Please select training type' }]}
            >
              <Select
                placeholder="Select training type"
                onChange={(value) => {
                  setTrainingType(value);
                  console.log('[TrainingForm] selected dropdown value:', value);
                }}
              >
                {TRAINING_TYPES.map(type => (
                  <Option key={type.value} value={type.value}>{type.label}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              name="title"
              label="Training Title"
              rules={[{ required: true, message: 'Please enter title' }]}
            >
              <Input placeholder="Enter training title" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="training_date"
              label="Training Date"
              rules={[{ required: true, message: 'Please select date' }]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              name="trainer"
              label="Trainer"
              rules={[{ required: true, message: 'Please enter trainer name' }]}
            >
              <Input placeholder="Enter trainer name" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item
              name="location"
              label="Location"
              rules={[{ required: true, message: 'Please enter location' }]}
            >
              <Input placeholder="Enter location" />
            </Form.Item>
          </Col>
        </Row>

        {trainingType === 'job_training' && (
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="job_role"
                label="Job Role"
                rules={[{ required: true, message: 'Please enter job role' }]}
              >
                <Input placeholder="Enter job role" />
              </Form.Item>
            </Col>
          </Row>
        )}

        <Row gutter={16}>
          <Col xs={24}>
            <Form.Item
              name="description"
              label="Description"
            >
              <TextArea rows={4} placeholder="Enter training description" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={loading}>
              {trainingId ? 'Update' : 'Create'} Training
            </Button>
            <Button onClick={onCancel}>
              Cancel
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default TrainingForm;
