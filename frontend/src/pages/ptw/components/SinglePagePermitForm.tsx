import React, { useState, useEffect, useCallback } from 'react';
import { Form, Input, Button, Select, DatePicker, Switch, Card, Row, Col, App, Spin, Space, Checkbox, Divider, Typography, Tag, Tabs, Upload } from 'antd';
import { EnvironmentOutlined, QrcodeOutlined, SaveOutlined, CloseOutlined, PlusOutlined, SyncOutlined, UploadOutlined, CameraOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import TextArea from 'antd/es/input/TextArea';
import { useAuthStore } from '../../../store/authStore';
import { createPermit, updatePermit, getPermitTypes, getPermit, getPermitTypeResolvedTemplate, generatePermitQrCode } from '../api';
import { apiClient } from '../../../lib/api';
import RiskAssessmentSection from './RiskAssessmentSection';
import type { RiskAssessmentData } from './RiskAssessmentSection';

const { Option } = Select;
const { Text } = Typography;
const { TabPane } = Tabs;

type ChecklistItem = { key: string; label: string; required: boolean; default_checked: boolean };

interface SinglePagePermitFormProps {
  permitId?: number | null;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const SinglePagePermitForm: React.FC<SinglePagePermitFormProps> = ({ permitId: propPermitId, onSuccess, onCancel }) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { id: routeId } = useParams<{ id: string }>();
  const id = propPermitId != null ? String(propPermitId) : routeId;
  const isEditing = !!id;
  const { projectId } = useAuthStore();

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [riskScore, setRiskScore] = useState(0);
  const [riskLevel, setRiskLevel] = useState('');
  const [riskData, setRiskData] = useState<RiskAssessmentData | null>(null);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [permitTypes, setPermitTypes] = useState<any[]>([]);
  const [resolvedTemplate, setResolvedTemplate] = useState<any>(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [gpsCoordinates, setGpsCoordinates] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);
  const [verifierType, setVerifierType] = useState<string | null>(null);
  const [verifierUsers, setVerifierUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    if (!verifierType) {
      setVerifierUsers([]);
      return;
    }
    setLoadingUsers(true);
    apiClient.get('/api/auth/users/', { params: { admin_type: verifierType } })
      .then(res => {
        const users = Array.isArray(res.data) ? res.data : (res.data?.results || []);
        setVerifierUsers(users);
      })
      .catch(() => setVerifierUsers([]))
      .finally(() => setLoadingUsers(false));
  }, [verifierType]);

  useEffect(() => {
    loadPermitTypes();
    if (isEditing && id) {
      loadPermitData();
    } else {
      const permitNumber = `PTW-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      form.setFieldsValue({ permit_number: permitNumber, work_nature: 'day' });
    }
  }, [id]);

  useEffect(() => {
    if (!gpsCoordinates) return;
    const parts = gpsCoordinates.split(',');
    if (parts.length !== 2) return;
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lng)) return;
    setGeoLoading(true);
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
      headers: { 'Accept-Language': 'en' }
    })
      .then(res => res.json())
      .then(data => {
        const a = data.address || {};
        const address = [
          a.suburb || a.neighbourhood,
          a.city || a.town || a.village || a.county,
          a.state,
          a.country
        ].filter(Boolean).join(', ') || data.display_name || '';
        if (address) form.setFieldsValue({ location: address });
      })
      .catch(() => {})
      .finally(() => setGeoLoading(false));
  }, [gpsCoordinates]);

  const loadPermitTypes = async () => {
    try {
      const response = await getPermitTypes();
      setPermitTypes(response.data?.results || response.data || []);
    } catch (error) {
      setPermitTypes([
        { id: 1, name: 'Hot Work - Arc Welding', category: 'hot_work' },
        { id: 5, name: 'Confined Space - Entry', category: 'confined_space' },
        { id: 7, name: 'Electrical - High Voltage', category: 'electrical' },
        { id: 10, name: 'Work at Height - Scaffolding', category: 'height' }
      ]);
    }
  };

  const loadPermitData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const response = await getPermit(parseInt(id));
      const permit = response.data;
      form.setFieldsValue({
        ...permit,
        permit_type: Number(permit.permit_type),
        planned_start_time: permit.planned_start_time ? dayjs(permit.planned_start_time) : null,
        planned_end_time: permit.planned_end_time ? dayjs(permit.planned_end_time) : null,
        probability: Number(permit.probability),
        severity: Number(permit.severity),
        safety_checklist: permit.safety_checklist || {}
      });
      if (permit.probability && permit.severity) {
        const s = Number(permit.probability) * Number(permit.severity);
        setRiskScore(s);
        setRiskLevel(s <= 4 ? 'Low' : s <= 9 ? 'Medium' : s <= 16 ? 'High' : 'Extreme');
      }
    } catch (error) {
      message.error('Failed to load permit');
    } finally {
      setLoading(false);
    }
  };

const handlePermitTypeChange = async (value: number) => {
    form.setFieldValue('permit_type', value);
    if (!value) return;
    
    setTemplateLoading(true);
    try {
      const response = await getPermitTypeResolvedTemplate(value, projectId);
      const template = response.data;
      const prefill = template.resolved_prefill || {};
      
      if (prefill.ppe_requirements?.length > 0) {
        form.setFieldValue('ppe_requirements', prefill.ppe_requirements);
      }
      if (prefill.control_measures) {
        const controls = Array.isArray(prefill.control_measures) ? prefill.control_measures.join('\n') : prefill.control_measures;
        form.setFieldValue('control_measures', controls);
      }
      if (prefill.safety_checklist?.length > 0) {
        const items = prefill.safety_checklist.map((item: any, idx: number) => ({
          key: typeof item === 'string' ? item : item.key || `item_${idx}`,
          label: typeof item === 'string' ? item : item.label || item,
          required: true,
          default_checked: true
        }));
        setChecklistItems(items);
        const checklistValues: Record<string, boolean> = {};
        items.forEach((item: ChecklistItem) => { checklistValues[item.key] = true; });
        form.setFieldValue('safety_checklist', checklistValues);
      }
      message.success('Template loaded');
    } catch {
      // Template load failed, using defaults
    } finally {
      setTemplateLoading(false);
    }
  };

  const generateQRCode = async () => {
    if (!id) {
      message.info('Save permit first');
      return;
    }
    setQrLoading(true);
    try {
      const response = await generatePermitQrCode(Number(id));
      setQrImage(response.data.qr_image);
      message.success('QR Code generated');
    } catch (error) {
      message.error('Failed to generate QR code');
    } finally {
      setQrLoading(false);
    }
  };

  const handleSubmit = async (values: any) => {
    setSubmitting(true);
    try {
      const submitData = {
        ...values,
        permit_type: Number(values.permit_type),
        planned_start_time: values.planned_start_time?.toISOString(),
        planned_end_time: values.planned_end_time?.toISOString(),
        probability: riskData?.probability ?? Number(values.probability) ?? 1,
        severity: riskData?.severity ?? Number(values.severity) ?? 1,
        control_measures: riskData?.control_measures ?? values.control_measures ?? '',
        hazards: riskData?.hazards ?? [],
        other_hazards: riskData?.other_hazards ?? '',
        risk_factors: riskData?.risk_factors ?? [],
        emergency_procedures: riskData?.emergency_procedures ?? '',
        ppe_requirements: values.ppe_requirements || [],
        safety_checklist: values.safety_checklist || {},
        permit_parameters: values.permit_parameters || {}
      };

      let response;
      if (isEditing) {
        response = await updatePermit(parseInt(id!), submitData);
        message.success('Permit updated successfully');
      } else {
        response = await createPermit(submitData);
        console.log('[PTW] Permit created:', response.data?.id, response.data?.permit_number);
        message.success(`Permit ${response.data?.permit_number || ''} created successfully`);
      }

      // Reset form state
      form.resetFields();
      setRiskData(null);
      setRiskScore(0);
      setRiskLevel('');
      setChecklistItems([]);
      setGpsCoordinates('');
      setQrImage(null);
      setVerifierType(null);
      setVerifierUsers([]);
      // Re-seed permit number for next creation
      const newPermitNumber = `PTW-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
      form.setFieldsValue({ permit_number: newPermitNumber, work_nature: 'day' });

      if (onSuccess) {
        onSuccess();
      } else {
        navigate('/app/ptw');
      }
    } catch (error: any) {
      const errDetail = error?.response?.data?.detail
        || (typeof error?.response?.data === 'object' ? JSON.stringify(error.response.data) : null)
        || 'Failed to save permit';
      console.error('[PTW] Save error:', error?.response?.data);
      message.error(errDetail);
    } finally {
      setSubmitting(false);
    }
  };

  const addChecklistItem = () => {
    const newItem: ChecklistItem = {
      key: `custom_${Date.now()}`,
      label: 'New checklist item',
      required: false,
      default_checked: false
    };
    setChecklistItems(prev => [...prev, newItem]);
  };

  const updateChecklistItemLabel = (key: string, label: string) => {
    setChecklistItems(prev => prev.map(item => item.key === key ? { ...item, label } : item));
  };

  const removeChecklistItem = (key: string) => {
    setChecklistItems(prev => prev.filter(item => item.key !== key));
    const checklistValues = { ...form.getFieldValue('safety_checklist') };
    delete checklistValues[key];
    form.setFieldValue('safety_checklist', checklistValues);
  };

  if (loading) return <div className="flex justify-center items-center min-h-screen"><Spin size="large" /></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">{isEditing ? 'Edit' : 'Create'} Permit to Work</h1>
          <Text type="secondary">All fields in one page - scroll to complete</Text>
        </div>
        <Space>
          {autoSaving && <Spin size="small" />}
          {isEditing && (
            <Button icon={<QrcodeOutlined />} onClick={generateQRCode} loading={qrLoading}>
              Generate QR
            </Button>
          )}
        </Space>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        onValuesChange={(changed) => {
          if ('gps_coordinates' in changed) setGpsCoordinates(changed.gps_coordinates || '');
        }}
      >
        {/* Basic Information */}
        <Card title="1. Basic Information" className="mb-4">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="permit_number" label="Permit Number" rules={[{ required: true }]}>
                <Input disabled style={{ backgroundColor: '#f5f5f5', color: '#000' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="permit_type" label="Permit Type" rules={[{ required: true }]}>
                <Select placeholder="Select permit type" onChange={handlePermitTypeChange} loading={permitTypes.length === 0}>
                  {permitTypes.map(type => (
                    <Option key={type.id} value={type.id}>{type.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Work Description" rules={[{ required: true, min: 10 }]}>
            <TextArea rows={3} placeholder="Detailed work description (minimum 10 characters)" showCount maxLength={1000} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="location" label={<span>Location {geoLoading && <Spin size="small" style={{ marginLeft: 6 }} />}</span>} rules={[{ required: true, min: 3 }]}>
                <Input placeholder={geoLoading ? 'Fetching address...' : 'Work location'} disabled={geoLoading} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="gps_coordinates" label="GPS Coordinates">
                <Input 
                  placeholder="Lat, Long" 
                  addonAfter={
                    <Button 
                      type="primary" 
                      icon={<EnvironmentOutlined />}
                      loading={geoLoading}
                      onClick={() => {
                        if (!navigator.geolocation) {
                          message.error('Geolocation not supported');
                          return;
                        }
                        setGeoLoading(true);
                        navigator.geolocation.getCurrentPosition(
                          (position) => {
                            const coords = `${position.coords.latitude.toFixed(6)},${position.coords.longitude.toFixed(6)}`;
                            form.setFieldsValue({ gps_coordinates: coords });
                            setGpsCoordinates(coords);
                            setGeoLoading(false);
                          },
                          () => {
                            setGeoLoading(false);
                            message.error('Failed to get location');
                          },
                          { enableHighAccuracy: true, timeout: 10000 }
                        );
                      }}
                    >
                      Get Location
                    </Button>
                  }
                />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="planned_start_time" label="Start Time" rules={[{ required: true }]}>
                <DatePicker showTime style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="planned_end_time" label="End Time" rules={[{ required: true }]}>
                <DatePicker showTime style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="work_nature" label="Work Nature" rules={[{ required: true }]}>
                <Select>
                  <Option value="day">Day Work</Option>
                  <Option value="night">Night Work</Option>
                  <Option value="both">Day & Night</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Card>

        {/* Risk Assessment */}
        <RiskAssessmentSection
          permitType={permitTypes.find(t => t.id === form.getFieldValue('permit_type')) || null}
          onChange={(data) => {
            setRiskData(data);
            setRiskScore(data.risk_score);
            setRiskLevel(data.risk_level);
          }}
        />

        {/* Safety Measures */}
        <Card title="3. Safety Measures" className="mb-4">
          <Form.Item name="ppe_requirements" label="PPE Requirements" rules={[{ required: true }]}>
            <Select mode="tags" placeholder="Select or add PPE">
              <Option value="helmet">Safety Helmet</Option>
              <Option value="gloves">Safety Gloves</Option>
              <Option value="shoes">Safety Shoes</Option>
              <Option value="goggles">Safety Goggles</Option>
              <Option value="harness">Fall Protection</Option>
              <Option value="respirator">Respirator</Option>
              <Option value="coveralls">Protective Coveralls</Option>
            </Select>
          </Form.Item>

          <Form.Item label="Safety Checklist">
            {checklistItems.length === 0 ? (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 6 }}>
                  No checklist items loaded. Apply the permit type template or add items.
                </div>
                <Button
                  type="link"
                  style={{ padding: 0 }}
                  onClick={() => {
                    const defaults = [
                      'Check PPE', 'Inspect tools', 'Ensure isolation',
                      'Verify permits', 'Emergency readiness', 'Supervisor approval'
                    ];
                    const items: ChecklistItem[] = defaults.map(label => ({
                      key: label, label, required: false, default_checked: true
                    }));
                    setChecklistItems(items);
                    const vals: Record<string, boolean> = {};
                    items.forEach(i => { vals[i.key] = true; });
                    form.setFieldValue('safety_checklist', vals);
                  }}
                >
                  Load suggested checklist (6 items)
                </Button>
              </div>
            ) : (
              checklistItems.map(item => (
                <Row key={item.key} gutter={8} align="middle" style={{ marginBottom: 8 }}>
                  <Col flex="none">
                    <Form.Item name={['safety_checklist', item.key]} valuePropName="checked" noStyle>
                      <Checkbox />
                    </Form.Item>
                  </Col>
                  <Col flex="auto">
                    <Input value={item.label} onChange={(e) => updateChecklistItemLabel(item.key, e.target.value)} />
                  </Col>
                  <Col flex="none">
                    {item.required && <Tag color="red">Required</Tag>}
                    <Button type="text" icon={<CloseOutlined />} onClick={() => removeChecklistItem(item.key)} disabled={item.required} />
                  </Col>
                </Row>
              ))
            )}
            <Button type="dashed" icon={<PlusOutlined />} onClick={addChecklistItem} style={{ marginTop: 8 }}>
              Add Checklist Item
            </Button>
          </Form.Item>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="requires_isolation" valuePropName="checked" label="LOTO Required">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="risk_assessment_completed" valuePropName="checked" label="Risk Assessment Done">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="training_verified" valuePropName="checked" label="Training Verified">
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="special_instructions" label="Special Instructions">
            <TextArea rows={3} placeholder="Any special safety instructions or precautions" />
          </Form.Item>

          <Form.Item name="emergency_contacts" label="Emergency Contacts">
            <TextArea rows={3} placeholder="Emergency contact numbers and procedures" />
          </Form.Item>

          <div style={{ marginTop: 16, padding: '12px 16px', background: '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0' }}>
            <strong style={{ fontSize: 13 }}>
              Standard Parameters for {permitTypes.find(t => t.id === form.getFieldValue('permit_type'))?.name || 'Permit Type'}
            </strong>
            <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>
              {form.getFieldValue('permit_type')
                ? templateLoading ? 'Loading template parameters...' : 'Template parameters applied from selected permit type.'
                : 'Select a permit type to view standard parameters.'}
            </div>
          </div>
        </Card>

        {/* Personnel & Documentation */}
        <Card title="4. Personnel & Documentation" className="mb-4">
          <Tabs defaultActiveKey="documentation">
            <TabPane tab="Documentation" key="documentation">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="work_photos" label="Work Area Photos">
                    <Upload listType="picture-card" multiple beforeUpload={() => false}>
                      <div><CameraOutlined /><div style={{ marginTop: 4 }}>Upload Photos</div></div>
                    </Upload>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="site_layout" label="Site Layout / Drawing">
                    <Upload beforeUpload={() => false}>
                      <Button icon={<UploadOutlined />}>Upload Site Layout</Button>
                    </Upload>
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="method_statement" label="Method Statement">
                    <Upload beforeUpload={() => false}>
                      <Button icon={<UploadOutlined />}>Upload Method Statement</Button>
                    </Upload>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="risk_assessment_doc" label="Risk Assessment">
                    <Upload beforeUpload={() => false}>
                      <Button icon={<UploadOutlined />}>Upload Risk Assessment</Button>
                    </Upload>
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="work_procedure" label="Work Procedure">
                    <Upload beforeUpload={() => false}>
                      <Button icon={<UploadOutlined />}>Upload Work Procedure</Button>
                    </Upload>
                  </Form.Item>
                </Col>
              </Row>
            </TabPane>

            <TabPane tab="Personnel" key="personnel">
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item label="Requestor / Receiver">
                    <Input
                      value={useAuthStore.getState().name || 'Current User'}
                      disabled
                      style={{ backgroundColor: '#f5f5f5' }}
                    />
                    <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                      Requestor and Receiver are automatically set to the permit creator.
                    </div>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item label="Verifier Type" required>
                    <Select
                      placeholder="Select verifier type"
                      value={verifierType}
                      onChange={(val) => {
                        setVerifierType(val);
                        form.setFieldValue('verifier', null);
                      }}
                      options={[
                        { label: 'EPC', value: 'epc' },
                        { label: 'Client', value: 'client' }
                      ]}
                    />
                  </Form.Item>
                  <Form.Item
                    name="verifier"
                    label="Select Verifier"
                    rules={[{ required: true, message: 'Please select a verifier' }]}
                  >
                    <Select
                      placeholder={verifierType ? 'Select verifier' : 'Select verifier type first'}
                      disabled={!verifierType}
                      loading={loadingUsers}
                      options={verifierUsers.map(user => ({
                        label: `${user.name || user.username} — ${user.designation || 'No Designation'} (${user.admin_type || verifierType})`,
                        value: user.id
                      }))}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <div style={{ background: '#1f1f1f', color: '#fff', padding: '10px 14px', borderRadius: 6, fontSize: 13, marginTop: 8 }}>
                You select the verifier. The verifier will then select the approver during the verification process.
              </div>
            </TabPane>

            <TabPane tab="QR & Mobile" key="qr_mobile">
              <Card size="small" title="QR Code Generation" style={{ marginBottom: 16 }}>
                <Button type="primary" icon={<QrcodeOutlined />} onClick={generateQRCode} loading={qrLoading}>
                  Generate QR Code
                </Button>
                {qrImage && (
                  <div style={{ marginTop: 16, textAlign: 'center' }}>
                    <img src={qrImage} alt="Permit QR Code" style={{ maxWidth: 220, border: '1px solid #d9d9d9', padding: 12 }} />
                  </div>
                )}
              </Card>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item name="mobile_created" valuePropName="checked" label="Created on Mobile">
                    <Switch />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="offline_id" label="Offline ID">
                    <Input placeholder="Offline sync ID" />
                  </Form.Item>
                </Col>
              </Row>
            </TabPane>
          </Tabs>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button onClick={() => onCancel ? onCancel() : navigate('/app/ptw')}>Cancel</Button>
          <Button type="primary" htmlType="submit" loading={submitting} icon={<SaveOutlined />}>
            {isEditing ? 'Update' : 'Create'} Permit
          </Button>
        </div>
      </Form>
    </div>
  );
};

export default SinglePagePermitForm;
