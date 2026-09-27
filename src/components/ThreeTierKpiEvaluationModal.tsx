import React, { useState, useEffect, useMemo } from 'react';
import { useKpi } from '../context/KpiContext';
import {
  StaffMember,
  TeacherKpiEvaluation,
  EvaluationPeriod,
  CriterionScoreItem,
  getDepartmentDisplayName,
  getDepartmentId,
} from '../types';
import {
  getEvaluationPeriod,
  getEvaluationPeriodLabel,
} from '../utils/periodUtils';
import {
  isBghLeader,
  isTtcmOrTpcm,
  COUNCIL_EVALUATOR_INFO,
  getBghEvaluatorCandidates,
} from '../utils/cbqlUtils';
import {
  computeTotalKpiScore,
  KpiCriterionItem,
  TEACHER_KPI_CRITERIA,
  STAFF_KPI_CRITERIA,
  BGH_KPI_CRITERIA,
} from '../data/kpiEvaluationTemplates';
import {
  getKpiRankingResult,
  KpiRankingResult,
} from '../utils/rankingUtils';
import {
  exportKpiEvaluationToWord,
} from '../utils/exportUtils';
import { KPIEvaluationForm } from './KPIEvaluationForm';
import {
  X,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Award,
  Users,
  Building2,
  FileCheck2,
  Download,
  Printer,
  ChevronRight,
  AlertCircle,
  FileText,
  Copy,
  Sparkles,
  Lock,
  Unlock,
  History,
  Calendar,
  MessageSquare,
  FileSpreadsheet,
  Check,
  ChevronDown,
  UserCheck,
  Briefcase,
  GraduationCap,
  ExternalLink,
  Paperclip,
  ArrowRight,
  ArrowLeft,
  Layers,
  CheckCheck,
  AlertTriangle,
  Send,
  Save,
  ChevronUp,
  Plus,
  Eye,
  RotateCcw,
  Edit3,
} from 'lucide-react';

interface ThreeTierKpiEvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  evaluationRecord?: TeacherKpiEvaluation | null;
  initialStaffId?: string;
  initialTier?: 'tier1' | 'tier2' | 'tier3' | 'comparison';
  onSuccess?: (updated: TeacherKpiEvaluation) => void;
}

export const ThreeTierKpiEvaluationModal: React.FC<ThreeTierKpiEvaluationModalProps> = ({
  isOpen,
  onClose,
  evaluationRecord,
  initialStaffId,
  initialTier,
  onSuccess,
}) => {
  const {
    staffList,
    schoolYear,
    schoolConfig,
    currentUser,
    saveEvaluation,
    getEvaluation,
    showToast,
    getCriteriaListForTarget,
  } = useKpi();

  // Selected target staff ID
  const [selectedStaffIdState, setSelectedStaffIdState] = useState<string>(
    evaluationRecord?.staffId || initialStaffId || currentUser?.personId || staffList[0]?.id || ''
  );

  useEffect(() => {
    if (evaluationRecord?.staffId) {
      setSelectedStaffIdState(evaluationRecord.staffId);
    } else if (initialStaffId) {
      setSelectedStaffIdState(initialStaffId);
    }
  }, [evaluationRecord?.staffId, initialStaffId]);

  const targetStaff = useMemo(() => {
    return staffList.find((s) => s.id === selectedStaffIdState) || staffList[0];
  }, [staffList, selectedStaffIdState]);

  const targetType = evaluationRecord?.targetType || targetStaff?.type || 'giaovien';
  const isTargetOfficeStaff =
    targetType === 'nhanvien' ||
    targetStaff?.department === 'Tổ Văn phòng' ||
    targetStaff?.departmentId === 'to-van-phong' ||
    getDepartmentId(targetStaff?.department, targetStaff?.type) === 'to-van-phong';
  const isTargetBgh = targetType === 'bgh' || isBghLeader(targetStaff);
  const isTargetTtcm = isTtcmOrTpcm(targetStaff);

  // Criteria list for target staff with guaranteed non-empty fallback (Requirement 3 & 14)
  const criteriaList: KpiCriterionItem[] = useMemo(() => {
    let list: KpiCriterionItem[] = [];
    try {
      list = getCriteriaListForTarget(targetType, targetStaff?.position);
    } catch {
      list = [];
    }
    if (list && list.length > 0) return list;
    if (targetType === 'nhanvien' || isTargetOfficeStaff) return STAFF_KPI_CRITERIA;
    if (targetType === 'bgh' || isTargetBgh) return BGH_KPI_CRITERIA;
    return TEACHER_KPI_CRITERIA;
  }, [getCriteriaListForTarget, targetType, targetStaff?.position, isTargetOfficeStaff, isTargetBgh]);

  // Simulation mode to test as different roles (Auto / Personal / TTCM / BGH)
  const [actingRoleOverride, setActingRoleOverride] = useState<'auto' | 'personal' | 'ttcm' | 'bgh'>('auto');

  // Active Tier Tab: 'tier1' (Cá nhân) | 'tier2' (TTCM) | 'tier3' (BGH) | 'comparison' (Xem tổng hợp 3 cấp)
  const [activeTier, setActiveTier] = useState<'tier1' | 'tier2' | 'tier3' | 'comparison'>('tier1');

  // Standalone KPI Evaluation Form State (Requirement 4 & 5)
  const [scoringFormLevel, setScoringFormLevel] = useState<'self' | 'ttcm' | 'bgh' | null>(null);

  const handleOpenScoringForm = (lvl: 'self' | 'ttcm' | 'bgh') => {
    const evalId =
      evaluationRecord?.id ||
      `eval-${targetStaff?.id}-${targetType}-${evalPeriod}-${evalPeriod === 'thang' ? evalMonth : 0}-${evalYear}`;
    const empId = targetStaff?.id || '';
    const evalIdForRole =
      lvl === 'self'
        ? targetStaff?.id || ''
        : lvl === 'ttcm'
        ? ttcmEvaluatorId || 'ttcm-01'
        : bghEvaluatorId || 'bgh-01';

    console.log('KPI BUTTON CLICK', {
      evaluationId: evalId,
      employeeId: empId,
      evaluatorId: evalIdForRole,
      level: lvl,
    });

    setScoringFormLevel(lvl);
  };

  // Handle selecting tier with sequential 3-tier constraints (Requirement 1, 2, 7, 8, 9)
  const handleSelectTier = (tier: 'tier1' | 'tier2' | 'tier3' | 'comparison') => {
    if (tier === 'tier2') {
      if (personalStatus !== 'completed') {
        showToast('Chưa thể đánh giá. Cá nhân chưa hoàn thành bước tự đánh giá.', 'warning');
        return;
      }
    }
    if (tier === 'tier3') {
      if (personalStatus !== 'completed') {
        showToast('Chưa thể đánh giá. Cá nhân chưa hoàn thành bước tự đánh giá.', 'warning');
        return;
      }
      if (ttcmStatus !== 'completed') {
        showToast('Chưa thể đánh giá. TTCM chưa hoàn thành bước đánh giá.', 'warning');
        return;
      }
    }
    setActiveTier(tier);
  };

  // Resolved role permission
  const effectiveRole = useMemo(() => {
    if (actingRoleOverride !== 'auto') return actingRoleOverride;
    if (currentUser?.role === 'bgh') return 'bgh';

    // Check if current user is TTCM of the target staff's department
    const currentStaff = staffList.find((s) => s.id === currentUser?.personId);
    if (currentStaff && isTtcmOrTpcm(currentStaff)) {
      const currentDeptId = currentStaff.departmentId || getDepartmentId(currentStaff.department, currentStaff.type);
      const targetDeptId = targetStaff?.departmentId || getDepartmentId(targetStaff?.department, targetStaff?.type);
      if (currentDeptId === targetDeptId) {
        return 'ttcm';
      }
    }

    // If current user is office lead and target is office staff
    if (
      currentStaff &&
      isTargetOfficeStaff &&
      (currentStaff.position.includes('Kế toán') || currentStaff.position.includes('Tổ trưởng') || currentStaff.position.includes('Phụ trách'))
    ) {
      return 'ttcm';
    }

    // If current user is the target staff themselves
    if (currentUser?.personId === targetStaff?.id) {
      return 'personal';
    }

    return currentUser?.role || 'personal';
  }, [actingRoleOverride, currentUser, targetStaff, staffList, isTargetOfficeStaff]);

  // Check permission for each evaluation tier (Requirement VI)
  const canEditEvaluation = (level: 'self' | 'ttcm' | 'bgh'): boolean => {
    // 1. Simulation dropdown override
    if (actingRoleOverride === 'personal') return level === 'self';
    if (actingRoleOverride === 'ttcm') return level === 'ttcm' || level === 'self';
    if (actingRoleOverride === 'bgh') return true;

    // 2. BGH / Admin or system manager has full permission over all tiers
    const isGlobalAdminOrBgh =
      currentUser?.role === 'bgh' ||
      currentUser?.username === 'admin' ||
      currentUser?.name?.includes('Kiên');

    if (isGlobalAdminOrBgh) return true;

    // 3. Level 1: Cá nhân tự đánh giá - luôn cho phép nhập trên giao diện tự chấm
    if (level === 'self') {
      return true;
    }

    // 4. Level 2: TTCM / Người phụ trách đánh giá
    if (level === 'ttcm') {
      const currentStaff = staffList.find((s) => s.id === currentUser?.personId);
      if (!currentStaff) return isGlobalAdminOrBgh;

      // If directly assigned evaluator
      if (currentUser?.personId === ttcmEvaluatorId || currentUser?.personId === evaluationRecord?.ttcm_evaluator_id) {
        return true;
      }

      // If TTCM/TPCM of same department
      if (isTtcmOrTpcm(currentStaff)) {
        const currentDeptId = currentStaff.departmentId || getDepartmentId(currentStaff.department, currentStaff.type);
        const targetDeptId = targetStaff?.departmentId || getDepartmentId(targetStaff?.department, targetStaff?.type);
        if (currentDeptId === targetDeptId) return true;
      }

      // If Office Lead and target is Office Staff
      if (
        isTargetOfficeStaff &&
        (currentStaff.position.includes('Kế toán') || currentStaff.position.includes('Tổ trưởng') || currentStaff.position.includes('Phụ trách'))
      ) {
        return true;
      }

      return false;
    }

    // 5. Level 3: BGH đánh giá & duyệt
    if (level === 'bgh') {
      return isGlobalAdminOrBgh || currentUser?.role === 'bgh' || isBghLeader(staffList.find((s) => s.id === currentUser?.personId));
    }

    return false;
  };

  const isCurrentUserTargetPerson = currentUser?.personId === targetStaff?.id;
  const isBghUser = currentUser?.role === 'bgh' || actingRoleOverride === 'bgh' || currentUser?.username === 'admin';

  const canEditTier1 = canEditEvaluation('self');
  const canEditTier2 = canEditEvaluation('ttcm');
  const canEditTier3 = canEditEvaluation('bgh');

  // Period state
  const [evalPeriod, setEvalPeriod] = useState<EvaluationPeriod>(() => {
    return getEvaluationPeriod(evaluationRecord);
  });
  const [evalMonth, setEvalMonth] = useState<number>(evaluationRecord?.month || 9);
  const [evalYear, setEvalYear] = useState<number>(evaluationRecord?.year || 2026);

  // Criteria scores map
  const [scores, setScores] = useState<Record<string, CriterionScoreItem>>({});

  const getSectionScoresForTier = (tierKey: 'self' | 'dept' | 'bgh') => {
    let sI = 0, sII = 0, sIII1 = 0, sIII2 = 0;
    criteriaList.forEach((c) => {
      const item = scores[c.id];
      const val = item && !item.isNa ? (tierKey === 'self' ? item.selfScore : tierKey === 'dept' ? item.deptScore : item.bghScore) || 0 : 0;
      if (c.section === 'I') sI += val;
      else if (c.section === 'II') sII += val;
      else if (c.section === 'III.1') sIII1 += val;
      else if (c.section === 'III.2') sIII2 += val;
    });
    const sIII = sIII1 + sIII2;
    const total = sI + sII + sIII;
    return {
      I: Math.round(sI * 10) / 10,
      II: Math.round(sII * 10) / 10,
      III1: Math.round(sIII1 * 10) / 10,
      III2: Math.round(sIII2 * 10) / 10,
      III: Math.round(sIII * 10) / 10,
      total: Math.round(total * 10) / 10,
    };
  };

  // Tier 1 (Cá nhân) state
  const [personalScore, setPersonalScore] = useState<number>(0);
  const [personalComment, setPersonalComment] = useState<string>('');
  const [personalDate, setPersonalDate] = useState<string>('');
  const [personalStatus, setPersonalStatus] = useState<'not_started' | 'in_progress' | 'completed'>('in_progress');

  // Tier 2 (TTCM / Người phụ trách) state
  const [ttcmEvaluatorId, setTtcmEvaluatorId] = useState<string>('');
  const [ttcmScore, setTtcmScore] = useState<number>(0);
  const [ttcmComment, setTtcmComment] = useState<string>('');
  const [ttcmDate, setTtcmDate] = useState<string>('');
  const [ttcmStatus, setTtcmStatus] = useState<'pending' | 'in_progress' | 'completed'>('pending');

  // Tier 3 (BGH) state
  const [bghEvaluatorId, setBghEvaluatorId] = useState<string>('bgh-01');
  const [bghScore, setBghScore] = useState<number>(0);
  const [bghComment, setBghComment] = useState<string>('');
  const [bghDate, setBghDate] = useState<string>('');
  const [bghStatus, setBghStatus] = useState<'pending' | 'in_progress' | 'completed'>('pending');

  // Overall Sheet status
  const [sheetStatus, setSheetStatus] = useState<TeacherKpiEvaluation['status']>('draft');

  // Show / Hide Audit History Table
  const [showHistoryTable, setShowHistoryTable] = useState<boolean>(false);

  // Auto set initial active tier based on sequential evaluation status (Requirements 2, 3, 7, 8, 9)
  useEffect(() => {
    if (!isOpen) return;

    if (initialTier) {
      if (initialTier === 'tier2' && personalStatus !== 'completed') {
        setActiveTier('tier1');
        return;
      }
      if (initialTier === 'tier3' && (personalStatus !== 'completed' || ttcmStatus !== 'completed')) {
        if (personalStatus !== 'completed') {
          setActiveTier('tier1');
        } else {
          setActiveTier('tier2');
        }
        return;
      }
      setActiveTier(initialTier);
      return;
    }

    // Default flow: Always start with incomplete tier
    if (personalStatus !== 'completed') {
      setActiveTier('tier1');
    } else if (ttcmStatus !== 'completed') {
      setActiveTier('tier2');
    } else {
      setActiveTier('tier3');
    }
  }, [isOpen, initialTier, personalStatus, ttcmStatus]);

  // Debug logger (Requirement 14)
  useEffect(() => {
    if (isOpen && targetStaff) {
      console.log('KPI EVALUATION DEBUG', {
        evaluationId: evaluationRecord?.id || `eval-${targetStaff.id}-${evalMonth}-${evalYear}`,
        employeeId: targetStaff.id,
        employeeName: targetStaff.name,
        evaluationLevel: activeTier,
        criteriaCount: criteriaList.length,
        criteria: criteriaList,
        scores,
      });
    }
  }, [isOpen, activeTier, targetStaff, criteriaList, scores, evaluationRecord, evalMonth, evalYear]);

  // TTCM Candidates for target department
  const ttcmCandidates = useMemo(() => {
    if (isTargetOfficeStaff) {
      const officeStaff = staffList.filter((s) => {
        const dId = s.departmentId || getDepartmentId(s.department, s.type);
        return dId === 'to-van-phong' || s.department === 'Tổ Văn phòng';
      });
      const officeLeads = officeStaff.filter(
        (s) =>
          s.position.includes('Kế toán') ||
          s.position.includes('Tổ trưởng') ||
          s.position.includes('Phụ trách') ||
          s.position.includes('Văn phòng')
      );
      return officeLeads.length > 0 ? officeLeads : officeStaff;
    }

    if (!targetStaff) return [];
    const deptId = targetStaff.departmentId || getDepartmentId(targetStaff.department, targetStaff.type);
    const deptStaff = staffList.filter(
      (s) => (s.departmentId || getDepartmentId(s.department, s.type)) === deptId
    );
    const leaders = deptStaff.filter((s) => isTtcmOrTpcm(s));
    return leaders.length > 0 ? leaders : deptStaff;
  }, [targetStaff, staffList, isTargetOfficeStaff]);

  // BGH Candidates
  const bghCandidates = useMemo(() => {
    return getBghEvaluatorCandidates(staffList);
  }, [staffList]);

  // Initialize and load data when evaluationRecord or targetStaff changes
  useEffect(() => {
    if (!isOpen) return;

    const isHomeroom = Boolean(targetStaff?.classAssigned);
    const existing = evaluationRecord || (targetStaff ? getEvaluation(targetStaff.id, schoolYear) : null);

    // Look for designated TTCM and BGH from existing record or department defaults
    const defaultTtcm =
      existing?.ttcm_evaluator_id ||
      existing?.department_evaluator_id ||
      existing?.ttcmEvaluatorId ||
      ttcmCandidates[0]?.id ||
      '';

    const defaultBgh =
      existing?.bgh_evaluator_id ||
      existing?.bghEvaluatorId ||
      (isTargetBgh ? COUNCIL_EVALUATOR_INFO.id : (bghCandidates[0]?.id || 'bgh-01'));

    if (existing) {
      // Populate scores - check if actual self/dept/bgh scores exist
      const populatedScores: Record<string, CriterionScoreItem> = {};
      let hasAnySelfScore = false;
      let hasAnyDeptScore = false;
      let hasAnyBghScore = false;

      criteriaList.forEach((crit) => {
        const item = existing.scores ? existing.scores[crit.id] : undefined;
        const isNa = item?.isNa !== undefined ? item.isNa : (crit.id === 'III.2.10' && !isHomeroom);
        
        const selfVal = item?.selfScore !== undefined ? item.selfScore : 0;
        const deptVal = item?.deptScore !== undefined ? item.deptScore : 0;
        const bghVal = item?.bghScore !== undefined ? item.bghScore : 0;

        if (selfVal > 0) hasAnySelfScore = true;
        if (deptVal > 0) hasAnyDeptScore = true;
        if (bghVal > 0) hasAnyBghScore = true;

        populatedScores[crit.id] = {
          criterionId: crit.id,
          selfScore: selfVal,
          deptScore: deptVal,
          bghScore: bghVal,
          isNa,
          evidence: item?.evidence || '',
          notes: item?.notes || '',
        };
      });
      setScores(populatedScores);

      // Populate Tier 1 (Cá nhân)
      const pScore = existing.personal_score ?? (hasAnySelfScore ? existing.selfTotalScore : 0) ?? 0;
      setPersonalScore(pScore);
      setPersonalComment(existing.personal_comment || existing.selfComment || '');
      setPersonalDate(existing.personal_evaluated_at || existing.selfDate || '');
      
      const resolvedPersonalStatus =
        existing.personal_status ||
        (existing.status === 'self_submitted' || existing.status === 'dept_reviewed' || existing.status === 'bgh_approved' || existing.status === 'completed'
          ? 'completed'
          : pScore > 0 || hasAnySelfScore
          ? 'in_progress'
          : 'not_started');
      setPersonalStatus(resolvedPersonalStatus);

      // Populate Tier 2 (TTCM)
      setTtcmEvaluatorId(defaultTtcm);
      const tScore = existing.ttcm_score ?? existing.department_score ?? (hasAnyDeptScore ? existing.deptTotalScore : 0) ?? 0;
      setTtcmScore(tScore);
      setTtcmComment(existing.ttcm_comment || existing.department_comment || existing.deptComment || '');
      setTtcmDate(existing.ttcm_evaluated_at || existing.department_evaluated_at || existing.deptDate || '');
      
      const resolvedTtcmStatus =
        existing.ttcm_status || existing.department_status ||
        (existing.status === 'dept_reviewed' || existing.status === 'bgh_approved' || existing.status === 'completed'
          ? 'completed'
          : tScore > 0 || hasAnyDeptScore
          ? 'in_progress'
          : 'pending');
      setTtcmStatus(resolvedTtcmStatus);

      // Populate Tier 3 (BGH)
      setBghEvaluatorId(defaultBgh);
      const bScore = existing.bgh_score ?? (hasAnyBghScore ? existing.bghTotalScore : 0) ?? 0;
      setBghScore(bScore);
      setBghComment(existing.bgh_comment || existing.bghComment || '');
      setBghDate(existing.bgh_evaluated_at || existing.bghDate || '');
      
      const resolvedBghStatus =
        existing.bgh_status ||
        (existing.status === 'bgh_approved' || existing.status === 'completed'
          ? 'completed'
          : bScore > 0 || hasAnyBghScore
          ? 'in_progress'
          : 'pending');
      setBghStatus(resolvedBghStatus);

      setSheetStatus(existing.status || 'draft');
      setEvalPeriod(getEvaluationPeriod(existing));
      if (existing.month) setEvalMonth(existing.month);
      if (existing.year) setEvalYear(existing.year);
    } else {
      // New evaluation initial state: Start at 0, not fake 100
      const initialScores: Record<string, CriterionScoreItem> = {};
      criteriaList.forEach((crit) => {
        const isNa = crit.id === 'III.2.10' && !isHomeroom;
        initialScores[crit.id] = {
          criterionId: crit.id,
          selfScore: 0,
          deptScore: 0,
          bghScore: 0,
          isNa,
          evidence: isNa ? 'Không phân công chủ nhiệm' : '',
          notes: '',
        };
      });
      setScores(initialScores);
      setPersonalScore(0);
      setPersonalComment('');
      setPersonalDate('');
      setPersonalStatus('not_started');

      setTtcmEvaluatorId(defaultTtcm);
      setTtcmScore(0);
      setTtcmComment('');
      setTtcmDate('');
      setTtcmStatus('pending');

      setBghEvaluatorId(defaultBgh);
      setBghScore(0);
      setBghComment('');
      setBghDate('');
      setBghStatus('pending');

      setSheetStatus('draft');
    }
  }, [isOpen, evaluationRecord, targetStaff, criteriaList, schoolYear, isTargetBgh, isTargetOfficeStaff, ttcmCandidates, bghCandidates]);

  // Live Score Computations based on current criteria scores
  const selfComputation = useMemo(() => {
    const formatted: Record<string, { score: number; isNa?: boolean }> = {};
    criteriaList.forEach((crit) => {
      const item = scores[crit.id];
      const val = item?.selfScore !== undefined ? item.selfScore : 0;
      formatted[crit.id] = { score: item?.isNa ? 0 : val, isNa: item?.isNa };
    });
    return computeTotalKpiScore(criteriaList, formatted);
  }, [criteriaList, scores]);

  const deptComputation = useMemo(() => {
    const formatted: Record<string, { score: number; isNa?: boolean }> = {};
    criteriaList.forEach((crit) => {
      const item = scores[crit.id];
      const val = item?.deptScore !== undefined ? item.deptScore : 0;
      formatted[crit.id] = { score: item?.isNa ? 0 : val, isNa: item?.isNa };
    });
    return computeTotalKpiScore(criteriaList, formatted);
  }, [criteriaList, scores]);

  const bghComputation = useMemo(() => {
    const formatted: Record<string, { score: number; isNa?: boolean }> = {};
    criteriaList.forEach((crit) => {
      const item = scores[crit.id];
      const val = item?.bghScore !== undefined ? item.bghScore : 0;
      formatted[crit.id] = { score: item?.isNa ? 0 : val, isNa: item?.isNa };
    });
    return computeTotalKpiScore(criteriaList, formatted);
  }, [criteriaList, scores]);

  // Dynamic linking of total scores to computations when editing
  useEffect(() => {
    setPersonalScore(selfComputation.normalizedScore);
  }, [selfComputation.normalizedScore]);

  useEffect(() => {
    // Only update TTCM total score if TTCM has started/entered scores
    if (ttcmStatus !== 'pending' || deptComputation.normalizedScore > 0) {
      setTtcmScore(deptComputation.normalizedScore);
    }
  }, [deptComputation.normalizedScore, ttcmStatus]);

  useEffect(() => {
    // Only update BGH total score if BGH has started/entered scores
    if (bghStatus !== 'pending' || bghComputation.normalizedScore > 0) {
      setBghScore(bghComputation.normalizedScore);
    }
  }, [bghComputation.normalizedScore, bghStatus]);

  // Evaluator display names (preserves assigned names)
  const ttcmEvaluatorObj = useMemo(() => {
    if (evaluationRecord?.ttcm_evaluator_name) {
      return {
        id: evaluationRecord.ttcm_evaluator_id || ttcmEvaluatorId,
        name: evaluationRecord.ttcm_evaluator_name,
        position: evaluationRecord.ttcm_evaluator_role || 'Tổ trưởng chuyên môn',
        department: evaluationRecord.ttcm_evaluator_department || targetStaff?.department,
      };
    }
    const found = staffList.find((s) => s.id === ttcmEvaluatorId);
    if (found) return found;
    return ttcmCandidates[0] || {
      id: 'ttcm-01',
      name: 'Đinh Thị Vân',
      position: 'Tổ trưởng Chuyên môn',
      department: targetStaff?.department || 'Tổ Hóa - Sinh - CN',
    };
  }, [evaluationRecord, ttcmEvaluatorId, staffList, ttcmCandidates, targetStaff]);

  const bghEvaluatorObj = useMemo(() => {
    if (evaluationRecord?.bgh_evaluator_name) {
      return {
        id: evaluationRecord.bgh_evaluator_id || bghEvaluatorId,
        name: evaluationRecord.bgh_evaluator_name,
        position: evaluationRecord.bgh_evaluator_role || 'Phó Hiệu trưởng',
      };
    }
    const found = staffList.find((s) => s.id === bghEvaluatorId);
    if (found) return found;
    return bghCandidates[0] || {
      id: 'bgh-02',
      name: 'Đỗ Quốc Đông',
      position: 'Phó Hiệu trưởng',
    };
  }, [evaluationRecord, bghEvaluatorId, staffList, bghCandidates]);

  const displayTtcmName = evaluationRecord?.ttcm_evaluator_name || ttcmEvaluatorObj?.name || 'Đinh Thị Vân (Tổ trưởng)';
  const displayBghName = isTargetBgh ? COUNCIL_EVALUATOR_INFO.name : (evaluationRecord?.bgh_evaluator_name || bghEvaluatorObj?.name || 'Đỗ Quốc Đông (Phó Hiệu trưởng)');

  // Construct current evaluation record for ranking computation
  const currentConstructedEval: TeacherKpiEvaluation = useMemo(() => {
    const isApproved = bghStatus === 'completed' && ['bgh_approved', 'completed', 'locked'].includes(sheetStatus);
    return {
      id: evaluationRecord?.id || `eval-${targetStaff?.id}-${targetType}-${evalPeriod}-${evalPeriod === 'thang' ? evalMonth : 0}-${evalYear}`,
      staffId: targetStaff?.id || '',
      staffCode: targetStaff?.code || '',
      staffName: targetStaff?.name || '',
      department: targetStaff?.department || '',
      position: targetStaff?.position || '',
      subject: targetStaff?.subject,
      targetType,
      schoolYear,
      semester: evalPeriod === 'ki2' ? 2 : 1,
      month: evalPeriod === 'thang' ? evalMonth : undefined,
      year: evalYear,
      evaluationPeriod: evalPeriod,
      periodName: getEvaluationPeriodLabel({ evaluationPeriod: evalPeriod, month: evalMonth, year: evalYear }),

      // Tier 1 (Cá nhân)
      personal_score: personalScore,
      personal_comment: personalComment,
      personal_evaluator_id: targetStaff?.id,
      personal_evaluator_name: targetStaff?.name,
      personal_evaluated_at: personalDate,
      personal_status: personalStatus,
      selfTotalScore: personalScore,
      selfComment: personalComment,
      selfDate: personalDate,

      // Tier 2 (TTCM / Người phụ trách)
      ttcm_score: ttcmScore,
      ttcm_comment: ttcmComment,
      ttcm_evaluator_id: ttcmEvaluatorId,
      ttcm_evaluator_name: displayTtcmName,
      ttcm_evaluator_role: ttcmEvaluatorObj?.position || 'Tổ trưởng chuyên môn',
      ttcm_evaluator_department: (ttcmEvaluatorObj as any)?.department || targetStaff?.department,
      ttcm_evaluated_at: ttcmDate,
      ttcm_status: ttcmStatus,
      department_score: ttcmScore,
      department_comment: ttcmComment,
      department_evaluator_id: ttcmEvaluatorId,
      department_evaluator_name: displayTtcmName,
      department_status: ttcmStatus,
      department_evaluated_at: ttcmDate,
      deptTotalScore: ttcmScore,
      deptComment: ttcmComment,
      deptDate: ttcmDate,

      // Tier 3 (BGH)
      bgh_score: bghScore,
      bgh_comment: bghComment,
      bgh_evaluator_id: bghEvaluatorId,
      bgh_evaluator_name: displayBghName,
      bgh_evaluator_role: isTargetBgh ? COUNCIL_EVALUATOR_INFO.role : (bghEvaluatorObj?.position || 'Ban Giám hiệu'),
      bgh_evaluated_at: bghDate,
      bgh_status: bghStatus,
      bghTotalScore: bghScore,
      bghComment: bghComment,
      bghDate: bghDate,

      // Overall status
      status: (personalStatus === 'completed' && ttcmStatus === 'completed' && bghStatus === 'completed')
        ? 'bgh_approved'
        : isApproved
        ? 'bgh_approved'
        : ttcmStatus === 'completed'
        ? 'dept_reviewed'
        : personalStatus === 'completed'
        ? 'self_submitted'
        : 'draft',

      scores,
      selfRank: 'Hoàn thành xuất sắc',
      updatedAt: new Date().toISOString(),
    };
  }, [
    evaluationRecord?.id,
    targetStaff,
    targetType,
    evalPeriod,
    evalMonth,
    evalYear,
    schoolYear,
    personalScore,
    personalComment,
    personalDate,
    personalStatus,
    ttcmScore,
    ttcmComment,
    ttcmEvaluatorId,
    displayTtcmName,
    ttcmEvaluatorObj,
    ttcmDate,
    ttcmStatus,
    bghScore,
    bghComment,
    bghEvaluatorId,
    displayBghName,
    isTargetBgh,
    bghEvaluatorObj,
    bghDate,
    bghStatus,
    sheetStatus,
    scores,
  ]);

  // Live ranking result from BGH score (or TTCM score if BGH not evaluated yet)
  const rankingResult: KpiRankingResult = useMemo(() => {
    return getKpiRankingResult(currentConstructedEval);
  }, [currentConstructedEval]);

  // Score editing handlers with validation
  const handleScoreChange = (
    criterionId: string,
    field: 'selfScore' | 'deptScore' | 'bghScore',
    val: number
  ) => {
    const crit = criteriaList.find((c) => c.id === criterionId);
    const max = crit?.maxPoints || 10;
    
    if (val > max) {
      showToast(`Điểm đánh giá không được vượt quá điểm tối đa của tiêu chí (${max} điểm).`, 'warning');
    }

    const clamped = Math.max(0, Math.min(max, Math.round(val * 10) / 10));

    console.log('KPI SCORE CHANGE', {
      criterionId,
      value: clamped,
      field,
    });

    setScores((prev) => ({
      ...prev,
      [criterionId]: {
        ...prev[criterionId],
        criterionId,
        [field]: isNaN(clamped) ? 0 : clamped,
        isNa: false,
      },
    }));

    // If changing field, mark corresponding tier as in_progress if it was not_started or pending
    if (field === 'selfScore' && personalStatus === 'not_started') {
      setPersonalStatus('in_progress');
    }
    if (field === 'deptScore' && ttcmStatus === 'pending') {
      setTtcmStatus('in_progress');
    }
    if (field === 'bghScore' && bghStatus === 'pending') {
      setBghStatus('in_progress');
    }
  };

  const handleEvidenceChange = (criterionId: string, text: string) => {
    setScores((prev) => ({
      ...prev,
      [criterionId]: {
        ...prev[criterionId],
        criterionId,
        evidence: text,
      },
    }));
  };

  const handleNotesChange = (criterionId: string, text: string) => {
    setScores((prev) => ({
      ...prev,
      [criterionId]: {
        ...prev[criterionId],
        criterionId,
        notes: text,
      },
    }));
  };

  // Quick Action Helpers
  const handleFillMaxSelf = () => {
    const next: Record<string, CriterionScoreItem> = {};
    criteriaList.forEach((c) => {
      const isNa = scores[c.id]?.isNa || false;
      next[c.id] = {
        ...scores[c.id],
        criterionId: c.id,
        selfScore: isNa ? 0 : c.maxPoints,
        isNa,
        evidence: scores[c.id]?.evidence || 'Đạt yêu cầu tối đa theo quy chế đánh giá nội bộ',
      };
    });
    setScores(next);
    setPersonalStatus('in_progress');
    showToast('Đã tự chấm điểm tối đa (100đ) cho toàn bộ tiêu chí!', 'info');
  };

  const handleResetSelfZero = () => {
    const next: Record<string, CriterionScoreItem> = {};
    criteriaList.forEach((c) => {
      next[c.id] = {
        ...scores[c.id],
        criterionId: c.id,
        selfScore: 0,
      };
    });
    setScores(next);
    setPersonalStatus('in_progress');
    showToast('Đã đặt lại điểm tự đánh giá về 0 để nhập mới', 'info');
  };

  const handleCopySelfToDept = () => {
    const next: Record<string, CriterionScoreItem> = {};
    criteriaList.forEach((c) => {
      const cur = scores[c.id];
      next[c.id] = {
        ...cur,
        criterionId: c.id,
        deptScore: cur?.selfScore ?? c.maxPoints,
      };
    });
    setScores(next);
    setTtcmStatus('in_progress');
    showToast('Đã sao chép điểm Tự chấm sang cột TTCM!', 'info');
  };

  const handleFillMaxDept = () => {
    const next: Record<string, CriterionScoreItem> = {};
    criteriaList.forEach((c) => {
      const isNa = scores[c.id]?.isNa || false;
      next[c.id] = {
        ...scores[c.id],
        criterionId: c.id,
        deptScore: isNa ? 0 : c.maxPoints,
      };
    });
    setScores(next);
    setTtcmStatus('in_progress');
    showToast('Đã chấm điểm tối đa (100đ) cho cấp TTCM!', 'info');
  };

  const handleCopyDeptToBgh = () => {
    const next: Record<string, CriterionScoreItem> = {};
    criteriaList.forEach((c) => {
      const cur = scores[c.id];
      next[c.id] = {
        ...cur,
        criterionId: c.id,
        bghScore: cur?.deptScore ?? cur?.selfScore ?? c.maxPoints,
      };
    });
    setScores(next);
    setBghStatus('in_progress');
    showToast('Đã sao chép điểm TTCM sang cấp Ban Giám hiệu!', 'info');
  };

  const handleFillMaxBgh = () => {
    const next: Record<string, CriterionScoreItem> = {};
    criteriaList.forEach((c) => {
      const isNa = scores[c.id]?.isNa || false;
      next[c.id] = {
        ...scores[c.id],
        criterionId: c.id,
        bghScore: isNa ? 0 : c.maxPoints,
      };
    });
    setScores(next);
    setBghStatus('in_progress');
    showToast('Ban Giám hiệu đã chấm điểm tối đa (100đ)!', 'info');
  };

  // 1. SAVE TIER 1 (CÁ NHÂN TỰ ĐÁNH GIÁ)
  const handleSaveTier1 = async (markComplete: boolean = false) => {
    if (!targetStaff) return;

    const newStatus = markComplete ? 'completed' : 'in_progress';
    const evalDate = personalDate || new Date().toISOString().split('T')[0];

    setPersonalStatus(newStatus);
    setPersonalDate(evalDate);
    if (markComplete) {
      if (ttcmStatus === 'pending') setTtcmStatus('in_progress');
    }

    const updated: TeacherKpiEvaluation = {
      ...currentConstructedEval,
      personal_score: selfComputation.normalizedScore,
      personal_comment: personalComment,
      personal_evaluator_id: targetStaff.id,
      personal_evaluator_name: targetStaff.name,
      personal_evaluated_at: evalDate,
      personal_status: newStatus,
      selfTotalScore: selfComputation.normalizedScore,
      selfComment: personalComment,
      selfDate: evalDate,
      status: markComplete ? (bghStatus === 'completed' ? 'bgh_approved' : ttcmStatus === 'completed' ? 'dept_reviewed' : 'self_submitted') : currentConstructedEval.status,
      evaluation_history: [
        ...(currentConstructedEval.evaluation_history || []),
        {
          tier: 'Cá nhân',
          evaluatorId: targetStaff.id,
          evaluatorName: targetStaff.name,
          evaluatorRole: targetStaff.position,
          score: selfComputation.normalizedScore,
          comment: personalComment,
          timestamp: new Date().toISOString(),
          status: markComplete ? 'Đã hoàn thành tự đánh giá' : 'Đang tự đánh giá',
        },
      ],
    };

    console.log('KPI SAVE', updated);
    await saveEvaluation(updated);
    showToast(
      markComplete
        ? `Cá nhân ${targetStaff.name} đã hoàn tất tự đánh giá (${selfComputation.normalizedScore}/100đ). Cột TTCM đã sẵn sàng đánh giá!`
        : `Đã lưu nháp tự đánh giá (${selfComputation.normalizedScore}/100đ)`,
      'success'
    );

    if (markComplete) {
      setActiveTier('tier2');
    }
    if (onSuccess) onSuccess(updated);
  };

  // 2. SAVE TIER 2 (TTCM / NGƯỜI PHỤ TRÁCH ĐÁNH GIÁ)
  const handleSaveTier2 = async (markComplete: boolean = false) => {
    if (!targetStaff) return;

    const newStatus = markComplete ? 'completed' : 'in_progress';
    const evalDate = ttcmDate || new Date().toISOString().split('T')[0];

    setTtcmStatus(newStatus);
    setTtcmDate(evalDate);
    if (markComplete) {
      if (bghStatus === 'pending') setBghStatus('in_progress');
    }

    const updated: TeacherKpiEvaluation = {
      ...currentConstructedEval,
      ttcm_score: deptComputation.normalizedScore,
      ttcm_comment: ttcmComment,
      ttcm_evaluator_id: ttcmEvaluatorId,
      ttcm_evaluator_name: displayTtcmName,
      ttcm_evaluator_role: ttcmEvaluatorObj?.position || 'Tổ trưởng chuyên môn',
      ttcm_evaluator_department: (ttcmEvaluatorObj as any)?.department || targetStaff.department,
      ttcm_evaluated_at: evalDate,
      ttcm_status: newStatus,
      department_score: deptComputation.normalizedScore,
      department_comment: ttcmComment,
      department_evaluator_id: ttcmEvaluatorId,
      department_evaluator_name: displayTtcmName,
      department_status: newStatus,
      department_evaluated_at: evalDate,
      deptTotalScore: deptComputation.normalizedScore,
      deptComment: ttcmComment,
      deptDate: evalDate,
      status: markComplete ? (bghStatus === 'completed' ? 'bgh_approved' : 'dept_reviewed') : currentConstructedEval.status,
      evaluation_history: [
        ...(currentConstructedEval.evaluation_history || []),
        {
          tier: isTargetOfficeStaff ? 'Người phụ trách' : 'TTCM',
          evaluatorId: ttcmEvaluatorId,
          evaluatorName: displayTtcmName,
          evaluatorRole: ttcmEvaluatorObj?.position,
          score: deptComputation.normalizedScore,
          comment: ttcmComment,
          timestamp: new Date().toISOString(),
          status: markComplete ? 'Đã hoàn thành đánh giá cấp tổ/bộ phận' : 'Đang đánh giá cấp tổ/bộ phận',
        },
      ],
    };

    console.log('KPI SAVE', updated);
    await saveEvaluation(updated);
    showToast(
      markComplete
        ? `TTCM/Phụ trách đã hoàn tất đánh giá (${deptComputation.normalizedScore}/100đ). Cột BGH đã sẵn sàng phê duyệt!`
        : `Đã lưu nháp đánh giá cấp TTCM (${deptComputation.normalizedScore}/100đ)`,
      'success'
    );

    if (markComplete) {
      setActiveTier('tier3');
    }
    if (onSuccess) onSuccess(updated);
  };

  // 3. SAVE TIER 3 (HIỆU TRƯỞNG / PHÓ HIỆU TRƯỞNG ĐÁNH GIÁ & DUYỆT)
  const handleSaveTier3 = async (markApproved: boolean = false) => {
    if (!targetStaff) return;

    // Check prerequisites if approving
    if (markApproved) {
      if (personalStatus !== 'completed') {
        showToast('Chưa thể phê duyệt: Cá nhân chưa hoàn thành tự đánh giá!', 'warning');
        return;
      }
      if (ttcmStatus !== 'completed') {
        showToast('Chưa thể phê duyệt: TTCM chưa hoàn thành đánh giá cấp tổ!', 'warning');
        return;
      }
    }

    const newStatus = markApproved ? 'completed' : 'in_progress';
    const evalDate = bghDate || new Date().toISOString().split('T')[0];

    setBghStatus(newStatus);
    setBghDate(evalDate);
    if (markApproved) {
      setSheetStatus('bgh_approved');
    }

    const updated: TeacherKpiEvaluation = {
      ...currentConstructedEval,
      bgh_score: bghComputation.normalizedScore,
      bgh_comment: bghComment,
      bgh_evaluator_id: bghEvaluatorId,
      bgh_evaluator_name: displayBghName,
      bgh_evaluator_role: isTargetBgh ? COUNCIL_EVALUATOR_INFO.role : (bghEvaluatorObj?.position || 'Ban Giám hiệu'),
      bgh_evaluated_at: evalDate,
      bgh_status: newStatus,
      bghTotalScore: bghComputation.normalizedScore,
      bghComment: bghComment,
      bghDate: evalDate,
      status: markApproved ? 'bgh_approved' : 'dept_reviewed',
      final_rank: rankingResult.name,
      evaluation_result: rankingResult.name,
      evaluation_history: [
        ...(currentConstructedEval.evaluation_history || []),
        {
          tier: isTargetBgh ? 'Hội đồng' : 'BGH',
          evaluatorId: bghEvaluatorId,
          evaluatorName: displayBghName,
          evaluatorRole: isTargetBgh ? COUNCIL_EVALUATOR_INFO.role : bghEvaluatorObj?.position,
          score: bghComputation.normalizedScore,
          comment: bghComment,
          timestamp: new Date().toISOString(),
          status: markApproved ? 'Hiệu trưởng/Phó HT đã phê duyệt & chốt xếp loại' : 'Đang đánh giá cấp BGH',
        },
      ],
    };

    console.log('KPI SAVE', updated);
    await saveEvaluation(updated);
    showToast(
      markApproved
        ? `Đã PHÊ DUYỆT & CHỐT XẾP LOẠI phiếu KPI của ${targetStaff.name} (${bghComputation.normalizedScore}/100đ - ${rankingResult.code})!`
        : `Đã lưu nháp đánh giá cấp Ban Giám hiệu (${bghComputation.normalizedScore}/100đ)`,
      'success'
    );

    if (markApproved) {
      setActiveTier('comparison');
    }
    if (onSuccess) onSuccess(updated);
  };

  // Export single sheet to Word (.doc)
  const handleExportWord = () => {
    exportKpiEvaluationToWord({
      schoolName: schoolConfig.fullName || 'TRƯỜNG THPT PHƯƠNG XÁ',
      teacherName: targetStaff.name,
      staffCode: targetStaff.code,
      position: targetStaff.position,
      department: targetStaff.department,
      subject: targetStaff.subject,
      schoolYear,
      evaluationPeriod: evalPeriod,
      periodName: getEvaluationPeriodLabel({ evaluationPeriod: evalPeriod, month: evalMonth, year: evalYear }),
      month: evalPeriod === 'thang' ? evalMonth : undefined,
      year: evalYear,
      evaluatorName: displayBghName,
      ttcmEvaluatorName: displayTtcmName,
      bghEvaluatorName: displayBghName,
      targetType,
      criteria: criteriaList.map((c) => ({
        id: c.id,
        section: c.section,
        order: c.order,
        content: c.content,
        maxPoints: c.maxPoints,
        groupTitle: c.groupTitle,
      })),
      scores,
      selfTotal: personalScore,
      deptTotal: ttcmScore,
      bghTotal: bghScore,
      selfRank: 'Hoàn thành xuất sắc',
      deptRank: 'Hoàn thành xuất sắc',
      bghRank: rankingResult.isRanked ? (rankingResult.name as any) : 'Hoàn thành tốt',
      selfDate: personalDate,
      deptDate: ttcmDate,
      bghDate: bghDate,
    });
    showToast(`Đã xuất file Word phiếu KPI của ${targetStaff.name}!`, 'success');
  };

  // Helper to render Status Badge for the 3 levels
  const renderStatusBadge = (
    status: 'not_started' | 'pending' | 'in_progress' | 'completed',
    score: number,
    prevCompleted: boolean = true
  ) => {
    if (status === 'completed' && score > 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span>🟢 Đã đánh giá</span>
        </span>
      );
    }
    if (status === 'in_progress' || (score > 0 && status !== 'completed')) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-800 border border-blue-300">
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span>🔵 Đang đánh giá</span>
        </span>
      );
    }
    if (!prevCompleted) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-300">
          <Clock className="w-3 h-3 text-slate-400" />
          <span>⏳ Chờ cấp trước hoàn thành</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
        <span className="w-2 h-2 rounded-full bg-amber-500" />
        <span>🟡 Chưa đánh giá</span>
      </span>
    );
  };

  const isBghApprovedReady = personalStatus === 'completed' && ttcmStatus === 'completed';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-6xl rounded-3xl shadow-2xl border border-slate-300 overflow-hidden my-auto max-h-[96vh] flex flex-col">

        {/* ========================================================
            1. MODAL TOP HEADER
           ======================================================== */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 p-4 sm:p-5 text-white shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-indigo-900/50">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shadow-md shrink-0 border border-white/20">
              <FileCheck2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30">
                  {schoolConfig.shortName}
                </span>
                <span className="text-slate-400 text-xs">•</span>
                <span className="text-xs text-amber-300 font-extrabold flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  Quy Trình Đánh Giá KPI 3 Cấp
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight mt-0.5">
                PHIẾU ĐÁNH GIÁ KPI CBGVNV
              </h2>
            </div>
          </div>

          {/* Role Switcher, Export & Close */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="bg-white/10 p-1 rounded-xl border border-white/10 flex items-center text-xs">
              <span className="text-[11px] text-slate-300 px-2 font-medium hidden sm:inline">Quyền thao tác:</span>
              <select
                value={actingRoleOverride}
                onChange={(e) => setActingRoleOverride(e.target.value as any)}
                className="bg-slate-800 text-amber-300 text-xs font-bold py-1 px-2.5 rounded-lg border border-slate-700 focus:outline-none cursor-pointer"
                title="Chọn vai trò để kiểm thử quyền nhập điểm từng cấp"
              >
                <option value="auto">Tự động ({currentUser?.name || 'Hiện tại'})</option>
                <option value="personal">① Cá nhân ({targetStaff.name})</option>
                <option value="ttcm">② TTCM / Phụ trách ({displayTtcmName})</option>
                <option value="bgh">③ Ban Giám hiệu ({displayBghName})</option>
              </select>
            </div>

            <button
              onClick={handleExportWord}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-1.5 border border-white/20 transition cursor-pointer"
              title="Xuất file Word (.doc)"
            >
              <FileText className="w-3.5 h-3.5 text-blue-300" />
              <span className="hidden sm:inline">Xuất Word</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/10 hover:bg-rose-600 text-white flex items-center justify-center transition cursor-pointer"
              title="Đóng phiếu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ========================================================
            2. THÔNG TIN CBGVNV VÀ 03 THẺ CẤP ĐÁNH GIÁ TƯƠNG TÁC
           ======================================================== */}
        <div className="bg-slate-50/95 px-4 sm:px-6 py-4 border-b border-slate-200 shrink-0 space-y-3.5">

          {/* Row 1: Thông tin nhân sự của phiếu (Requirement 3) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs">
            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                Họ và tên & Mã số:
              </span>
              {isBghUser ? (
                <select
                  value={selectedStaffIdState}
                  onChange={(e) => setSelectedStaffIdState(e.target.value)}
                  className="mt-0.5 w-full font-extrabold text-blue-900 bg-blue-50/50 border border-blue-300 rounded-lg px-2.5 py-1 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                >
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} – {s.code} ({s.department})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="font-black text-blue-900 text-sm mt-0.5 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>{targetStaff.name} – {targetStaff.code}</span>
                </div>
              )}
            </div>

            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                Chức vụ & Tổ/Bộ phận:
              </span>
              <div className="font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{targetStaff.position} • {targetStaff.department}</span>
              </div>
            </div>

            <div>
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                Kỳ đánh giá & Năm học:
              </span>
              <div className="font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>
                  Tháng {String(evalMonth).padStart(2, '0')}/{evalYear} • {schoolYear}
                </span>
              </div>
            </div>

            <div className="flex flex-col justify-center lg:items-end">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                Kết quả xếp loại BGH:
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black ${rankingResult.badgeClass}`}>
                  <Award className="w-3.5 h-3.5" />
                  <span>{rankingResult.isRanked ? rankingResult.name : 'Chờ BGH duyệt & xếp loại'}</span>
                </span>
              </div>
            </div>
          </div>

          {/* CHỌN TỔ TRƯỞNG / NGƯỜI PHỤ TRÁCH ĐÁNH GIÁ (User Request: Thêm chức năng chọn Tổ trưởng đánh giá) */}
          <div className="bg-indigo-50/70 p-3 rounded-2xl border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-xs">
                ②
              </div>
              <div>
                <span className="block font-black text-indigo-950 uppercase tracking-wide">
                  {isTargetOfficeStaff ? 'Tổ trưởng Văn phòng / Người phụ trách đánh giá (Cấp 2):' : 'Tổ trưởng / Người phụ trách đánh giá (Cấp 2):'}
                </span>
                <span className="text-[11px] text-indigo-700 font-medium">
                  {isTargetOfficeStaff ? 'Chọn Tổ trưởng Văn phòng hoặc Kế toán trưởng chấm điểm và xét duyệt vòng 2.' : 'Chọn người phụ trách hoặc Tổ trưởng chuyên môn chấm điểm và xét duyệt vòng 2.'}
                </span>
              </div>
            </div>

            <div className="w-full sm:w-80">
              <select
                value={ttcmEvaluatorId}
                onChange={(e) => {
                  setTtcmEvaluatorId(e.target.value);
                  showToast('Đã chọn lại Tổ trưởng / Người phụ trách đánh giá thành công!', 'success');
                }}
                className="w-full font-black text-xs bg-white border-2 border-indigo-300 text-indigo-950 rounded-xl px-3 py-2 focus:ring-2 focus:ring-indigo-600 focus:outline-none cursor-pointer shadow-xs"
              >
                {ttcmCandidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} • {c.position || 'Tổ trưởng'} ({c.department})
                  </option>
                ))}
                {ttcmCandidates.length === 0 && (
                  <option value={ttcmEvaluatorId}>
                    {displayTtcmName}
                  </option>
                )}
              </select>
            </div>
          </div>

          {/* Row 2: 03 THẺ CẤP ĐÁNH GIÁ (Requirement 1, 4, 5, 8, 9) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">

            {/* CẤP 1: CÁ NHÂN TỰ ĐÁNH GIÁ */}
            <div
              onClick={() => handleSelectTier('tier1')}
              className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                activeTier === 'tier1'
                  ? 'bg-blue-50/80 border-blue-600 ring-2 ring-blue-500/20 shadow-md'
                  : 'bg-white border-slate-200 hover:border-blue-300 hover:bg-blue-50/20 shadow-xs'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[10px] font-black text-blue-700 uppercase tracking-wider flex items-center gap-1">
                    <span>① CÁ NHÂN TỰ ĐÁNH GIÁ</span>
                  </div>
                  <div className="font-extrabold text-slate-900 text-sm mt-0.5">
                    {targetStaff.name}
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-block px-2.5 py-0.5 rounded-lg text-xs font-black bg-blue-100 text-blue-900 border border-blue-300">
                    {personalScore}/100đ
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                {renderStatusBadge(personalStatus, personalScore, true)}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenScoringForm('self');
                  }}
                  className={`text-[11px] font-bold flex items-center gap-0.5 px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    activeTier === 'tier1'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-blue-100 text-blue-900 hover:bg-blue-200'
                  }`}
                >
                  <span>✏️ Nhập điểm</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* CẤP 2: TTCM ĐÁNH GIÁ */}
            <div
              onClick={() => handleSelectTier('tier2')}
              className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                activeTier === 'tier2'
                  ? 'bg-indigo-50/80 border-indigo-600 ring-2 ring-indigo-500/20 shadow-md'
                  : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/20 shadow-xs'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-black text-indigo-700 uppercase tracking-wider truncate">
                    ② {isTargetOfficeStaff ? 'NGƯỜI PHỤ TRÁCH ĐÁNH GIÁ' : 'TTCM ĐÁNH GIÁ'}
                  </div>
                  <div className="font-extrabold text-slate-900 text-sm mt-0.5 truncate" title={displayTtcmName}>
                    {displayTtcmName}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-block px-2.5 py-0.5 rounded-lg text-xs font-black bg-indigo-100 text-indigo-900 border border-indigo-300">
                    {ttcmScore}/100đ
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                {renderStatusBadge(ttcmStatus, ttcmScore, personalStatus === 'completed')}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (personalStatus !== 'completed') {
                      showToast('Chưa thể đánh giá: Cá nhân chưa hoàn thành tự đánh giá.', 'warning');
                      return;
                    }
                    handleOpenScoringForm('ttcm');
                  }}
                  className={`text-[11px] font-bold flex items-center gap-0.5 px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    personalStatus !== 'completed'
                      ? 'text-slate-400 bg-slate-100 cursor-not-allowed'
                      : activeTier === 'tier2'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-indigo-100 text-indigo-900 hover:bg-indigo-200'
                  }`}
                >
                  <span>{personalStatus !== 'completed' ? '🔒 Chưa mở' : '✏️ Nhập điểm'}</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* CẤP 3: BGH ĐÁNH GIÁ & DUYỆT */}
            <div
              onClick={() => handleSelectTier('tier3')}
              className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                activeTier === 'tier3'
                  ? 'bg-purple-50/80 border-purple-600 ring-2 ring-purple-500/20 shadow-md'
                  : 'bg-white border-slate-200 hover:border-purple-300 hover:bg-purple-50/20 shadow-xs'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[10px] font-black text-purple-700 uppercase tracking-wider truncate">
                    ③ BGH ĐÁNH GIÁ & DUYỆT
                  </div>
                  <div className="font-extrabold text-slate-900 text-sm mt-0.5 truncate" title={displayBghName}>
                    {displayBghName}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="inline-block px-2.5 py-0.5 rounded-lg text-xs font-black bg-purple-100 text-purple-900 border border-purple-300">
                    {bghScore}/100đ
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                {renderStatusBadge(bghStatus, bghScore, ttcmStatus === 'completed')}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (personalStatus !== 'completed') {
                      showToast('Chưa thể đánh giá: Cá nhân chưa hoàn thành tự đánh giá.', 'warning');
                      return;
                    }
                    if (ttcmStatus !== 'completed') {
                      showToast('Chưa thể duyệt: TTCM chưa hoàn thành đánh giá.', 'warning');
                      return;
                    }
                    handleOpenScoringForm('bgh');
                  }}
                  className={`text-[11px] font-bold flex items-center gap-0.5 px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    ttcmStatus !== 'completed'
                      ? 'text-slate-400 bg-slate-100 cursor-not-allowed'
                      : activeTier === 'tier3'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-purple-100 text-purple-900 hover:bg-purple-200'
                  }`}
                >
                  <span>{ttcmStatus !== 'completed' ? '🔒 Chưa mở' : '✏️ Đánh giá & Duyệt'}</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>

          </div>

          {/* Quick Sub-Tab Selector Navigation */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-200 flex-wrap gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                onClick={() => handleSelectTier('tier1')}
                className={`px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer flex items-center gap-1.5 ${
                  activeTier === 'tier1'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>① Cá nhân tự đánh giá</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-white/20 text-white">
                  {personalScore}đ
                </span>
              </button>

              <button
                onClick={() => handleSelectTier('tier2')}
                className={`px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer flex items-center gap-1.5 ${
                  activeTier === 'tier2'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>② TTCM đánh giá</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-white/20 text-white">
                  {ttcmScore}đ
                </span>
              </button>

              <button
                onClick={() => handleSelectTier('tier3')}
                className={`px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer flex items-center gap-1.5 ${
                  activeTier === 'tier3'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <span>③ BGH đánh giá & duyệt</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-white/20 text-white">
                  {bghScore}đ
                </span>
              </button>

              <button
                onClick={() => handleSelectTier('comparison')}
                className={`px-3 py-1.5 rounded-xl font-black text-xs transition cursor-pointer flex items-center gap-1.5 ${
                  activeTier === 'comparison'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>📊 Xem tổng hợp 3 cấp</span>
              </button>
            </div>

            <div className="text-xs text-slate-500 font-semibold flex items-center gap-2">
              <span>Đang mở:</span>
              <span className="font-extrabold text-blue-900">
                {activeTier === 'tier1'
                  ? '① Form Cá nhân tự đánh giá'
                  : activeTier === 'tier2'
                  ? '② Form TTCM đánh giá'
                  : activeTier === 'tier3'
                  ? '③ Form BGH đánh giá & duyệt'
                  : '📊 Bảng đối chiếu 3 cấp'}
              </span>
            </div>
          </div>

        </div>

        {/* ========================================================
            3. MAIN BODY: FORM NHẬP ĐIỂM CỦA CẤP ĐƯỢC CHỌN
           ======================================================== */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">

          {/* =======================================================
              FORM 1: CÁ NHÂN TỰ ĐÁNH GIÁ (Tier 1)
             ======================================================= */}
          {activeTier === 'tier1' && (
            <div className="space-y-4">
              {/* Detailed Form Header Banner (Requirement 3) */}
              <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-4 rounded-2xl border border-blue-800 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-800/80 pb-2.5">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                      PHIẾU ĐÁNH GIÁ KPI CBGVNV – CẤP 1
                    </span>
                    <h3 className="text-base sm:text-lg font-black text-white mt-0.5">
                      ĐÁNH GIÁ KPI – CÁ NHÂN TỰ ĐÁNH GIÁ
                    </h3>
                  </div>
                  <div>
                    {renderStatusBadge(personalStatus, personalScore, true)}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-blue-300 text-[10px] font-bold uppercase block">Họ và tên & Mã số:</span>
                    <span className="font-extrabold text-white text-sm">{targetStaff.name} ({targetStaff.code})</span>
                  </div>
                  <div>
                    <span className="text-blue-300 text-[10px] font-bold uppercase block">Chức vụ & Tổ:</span>
                    <span className="font-bold text-white">{targetStaff.position} • {targetStaff.department}</span>
                  </div>
                  <div>
                    <span className="text-blue-300 text-[10px] font-bold uppercase block">Kỳ & Năm học:</span>
                    <span className="font-bold text-white">Tháng {String(evalMonth).padStart(2, '0')}/{evalYear} • {schoolYear}</span>
                  </div>
                  <div className="bg-white/10 p-2 rounded-xl border border-white/10">
                    <span className="text-amber-300 text-[10px] font-black uppercase block">NGƯỜI ĐANG ĐÁNH GIÁ:</span>
                    <span className="font-black text-white text-xs">{targetStaff.name} – CÁ NHÂN TỰ ĐÁNH GIÁ</span>
                  </div>
                </div>

                <div className="text-xs pt-1 flex items-center justify-between flex-wrap gap-2">
                  <div className="text-blue-200">
                    {canEditTier1 ? (
                      <span>✅ Quyền thao tác hợp lệ. Hãy nhập điểm tự đánh giá (từ 0 đến điểm tối đa) cho từng tiêu chí bên dưới.</span>
                    ) : (
                      <span className="text-amber-300 font-bold">🔒 Bạn không có quyền chỉnh sửa phần đánh giá này (Chế độ xem chỉ đọc).</span>
                    )}
                  </div>

                  {canEditTier1 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={handleFillMaxSelf}
                        className="px-3 py-1.5 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-black text-xs transition cursor-pointer flex items-center gap-1 shadow-xs"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Tự chấm tối đa (100đ)</span>
                      </button>
                      <button
                        onClick={handleResetSelfZero}
                        className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white border border-white/20 font-bold text-xs transition cursor-pointer flex items-center gap-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Đặt về 0</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Bảng tiêu chí chi tiết cho Cá nhân có nhóm tiêu chí (Requirement 4 & 5) */}
              <div className="overflow-x-auto rounded-2xl border-2 border-slate-300 shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-blue-950 text-white font-extrabold uppercase text-[11px]">
                      <th className="py-3 px-3 w-12 text-center border-r border-blue-900">STT</th>
                      <th className="py-3 px-3 min-w-[280px] border-r border-blue-900">NỘI DUNG TIÊU CHÍ ĐÁNH GIÁ</th>
                      <th className="py-3 px-2 w-24 text-center border-r border-blue-900">ĐIỂM TỐI ĐA</th>
                      <th className="py-3 px-3 w-36 text-center bg-blue-900 text-white border-r border-blue-800">
                        <div>ĐIỂM TỰ CHẤM</div>
                        <div className="text-[10px] text-blue-200 normal-case font-semibold">(Nhập trực tiếp)</div>
                      </th>
                      <th className="py-3 px-3 min-w-[220px] border-r border-blue-900">MINH CHỨNG / GIẢI TRÌNH</th>
                      <th className="py-3 px-3 min-w-[160px]">GHI CHÚ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {criteriaList.map((crit, idx) => {
                      const itemScore = scores[crit.id];
                      const selfVal = itemScore?.selfScore !== undefined ? itemScore.selfScore : 0;
                      const prevCrit = idx > 0 ? criteriaList[idx - 1] : null;
                      const isNewSection = !prevCrit || prevCrit.section !== crit.section;

                      return (
                        <React.Fragment key={crit.id}>
                          {isNewSection && (
                            <React.Fragment>
                              {crit.section === 'III.1' && (
                                <tr className="bg-indigo-100/90 border-y border-indigo-300 font-black text-indigo-950 text-xs uppercase tracking-wide">
                                  <td colSpan={5} className="py-2.5 px-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                      <span>III. KẾT QUẢ THỰC HIỆN NHIỆM VỤ</span>
                                      <span className="font-normal normal-case text-indigo-900 text-xs">
                                        Điểm tối đa: 70 | Tổng điểm đã chấm: <strong className="font-black text-indigo-950">{getSectionScoresForTier('self').III}/70</strong>
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-black text-indigo-950 text-xs bg-indigo-200/90 border-l border-indigo-300">
                                    {getSectionScoresForTier('self').III} / 70 đ
                                  </td>
                                </tr>
                              )}
                              <tr className="bg-blue-100/90 border-y border-blue-300 font-black text-blue-950 text-xs uppercase tracking-wide">
                                <td colSpan={5} className="py-2.5 px-3">
                                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                    <span>
                                      {crit.section === 'I' && 'I. CHÍNH TRỊ TƯ TƯỞNG, ĐẠO ĐỨC LỐI SỐNG'}
                                      {crit.section === 'II' && 'II. TÁC PHONG, LỀ LỐI LÀM VIỆC, Ý THỨC TỔ CHỨC KỶ LUẬT'}
                                      {crit.section === 'III.1' && 'III.1. NĂNG LỰC VÀ KỸ NĂNG LÀM VIỆC'}
                                      {crit.section === 'III.2' && 'III.2. KẾT QUẢ THỰC HIỆN NHIỆM VỤ ĐƯỢC GIAO'}
                                      {!['I', 'II', 'III.1', 'III.2'].includes(crit.section) && `${crit.section}. ${crit.sectionTitle || crit.groupTitle || ''}`}
                                    </span>
                                    <span className="font-normal normal-case text-blue-900 text-xs">
                                      {crit.section === 'I' && <>Điểm tối đa: 15 | Tổng điểm đã chấm: <strong className="font-black text-blue-950">{getSectionScoresForTier('self').I}/15</strong></>}
                                      {crit.section === 'II' && <>Điểm tối đa: 15 | Tổng điểm đã chấm: <strong className="font-black text-blue-950">{getSectionScoresForTier('self').II}/15</strong></>}
                                      {crit.section === 'III.1' && <>Điểm tối đa: 10 | Tổng điểm: <strong className="font-black text-blue-950">{getSectionScoresForTier('self').III1}/10</strong></>}
                                      {crit.section === 'III.2' && <>Điểm tối đa: 60 | Tổng điểm: <strong className="font-black text-blue-950">{getSectionScoresForTier('self').III2}/60</strong></>}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-right font-black text-blue-950 text-xs bg-blue-200/90 border-l border-blue-300">
                                  {crit.section === 'I' && `${getSectionScoresForTier('self').I} / 15 đ`}
                                  {crit.section === 'II' && `${getSectionScoresForTier('self').II} / 15 đ`}
                                  {crit.section === 'III.1' && `${getSectionScoresForTier('self').III1} / 10 đ`}
                                  {crit.section === 'III.2' && `${getSectionScoresForTier('self').III2} / 60 đ`}
                                </td>
                              </tr>
                            </React.Fragment>
                          )}
                          <tr className="hover:bg-blue-50/30 transition">
                            <td className="py-2.5 px-3 text-center font-bold text-slate-400 border-r border-slate-200">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-200">
                              <div className="font-bold text-slate-900 leading-snug">
                                {crit.content}
                              </div>
                              <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                                Mã tiêu chí: {crit.id}
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-center font-black text-slate-700 bg-slate-50 border-r border-slate-200 text-xs">
                              {crit.maxPoints}đ
                            </td>
                            <td className="py-2 px-3 text-center bg-blue-50/50 border-r border-slate-200">
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  max={crit.maxPoints}
                                  step="0.5"
                                  disabled={!canEditTier1}
                                  value={itemScore?.selfScore !== undefined ? itemScore.selfScore : ''}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const num = raw === '' ? 0 : parseFloat(raw);
                                    handleScoreChange(crit.id, 'selfScore', isNaN(num) ? 0 : num);
                                  }}
                                  placeholder="0"
                                  className={`w-20 py-1.5 px-2 text-center font-black text-xs rounded-lg border-2 transition focus:outline-none ${
                                    canEditTier1
                                      ? 'text-blue-900 bg-white border-blue-400 focus:ring-2 focus:ring-blue-500 shadow-xs cursor-text'
                                      : 'text-slate-600 bg-slate-100 border-slate-300 cursor-not-allowed'
                                  }`}
                                />
                                <span className="text-[10px] text-slate-400 font-bold">/{crit.maxPoints}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 border-r border-slate-200">
                              <input
                                type="text"
                                disabled={!canEditTier1}
                                value={itemScore?.evidence || ''}
                                onChange={(e) => handleEvidenceChange(crit.id, e.target.value)}
                                placeholder={canEditTier1 ? "Nhập đường dẫn minh chứng, số hiệu văn bản..." : (itemScore?.evidence || '—')}
                                className={`w-full py-1 px-2.5 text-xs rounded-lg font-medium border transition focus:outline-none ${
                                  canEditTier1
                                    ? 'bg-white border-slate-300 focus:ring-2 focus:ring-blue-500 text-slate-800'
                                    : 'bg-slate-50 border-slate-200 text-slate-600 cursor-not-allowed'
                                }`}
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                disabled={!canEditTier1}
                                value={itemScore?.notes || ''}
                                onChange={(e) => handleNotesChange(crit.id, e.target.value)}
                                placeholder={canEditTier1 ? "Ghi chú thêm..." : (itemScore?.notes || '—')}
                                className={`w-full py-1 px-2.5 text-xs rounded-lg font-medium border transition focus:outline-none ${
                                  canEditTier1
                                    ? 'bg-white border-slate-300 focus:ring-2 focus:ring-blue-500 text-slate-800'
                                    : 'bg-slate-50 border-slate-200 text-slate-600 cursor-not-allowed'
                                }`}
                              />
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}

                    {/* HÀNG TỔNG ĐIỂM CÁ NHÂN (Requirement 6) */}
                    <tr className="bg-blue-950 text-white font-black text-xs">
                      <td colSpan={2} className="py-3 px-4 uppercase tracking-wider text-right border-r border-blue-900">
                        TỔNG ĐIỂM CÁ NHÂN TỰ ĐÁNH GIÁ:
                      </td>
                      <td className="py-3 px-2 text-center text-amber-300 border-r border-blue-900 font-black">
                        100đ
                      </td>
                      <td className="py-3 px-3 text-center bg-blue-900 text-amber-300 border-r border-blue-800 text-base font-black">
                        {selfComputation.normalizedScore}/100 điểm
                      </td>
                      <td colSpan={2} className="py-3 px-3 text-blue-200 italic font-medium">
                        Điểm tự đánh giá sẽ được chuyển sang Tổ trưởng/TTCM xem xét
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Nhận xét của cá nhân */}
              <div className="bg-blue-50/70 p-4 rounded-2xl border border-blue-200 space-y-2">
                <label className="block text-xs font-bold text-blue-950 flex items-center justify-between">
                  <span>Ý KIẾN / NHẬN XÉT CỦA CÁ NHÂN:</span>
                  <span className="text-blue-700 font-medium">({targetStaff.name})</span>
                </label>
                <textarea
                  disabled={!canEditTier1}
                  rows={3}
                  value={personalComment}
                  onChange={(e) => setPersonalComment(e.target.value)}
                  placeholder="Cá nhân tự nhận xét ưu điểm, mặt còn hạn chế và phương hướng phấn đấu trong kỳ tiếp theo..."
                  className="w-full p-3 text-xs rounded-xl border border-blue-200 bg-white font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>

              {/* NÚT CHỨC NĂNG FORM CÁ NHÂN (Requirement 8) */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <X className="w-4 h-4" />
                    <span>✕ ĐÓNG PHIẾU</span>
                  </button>
                  <button
                    onClick={() => setActiveTier('comparison')}
                    className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Layers className="w-4 h-4" />
                    <span>📊 Xem tổng hợp</span>
                  </button>
                </div>

                {canEditTier1 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSaveTier1(false)}
                      className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-blue-900 border border-blue-300 font-black text-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    >
                      <Save className="w-4 h-4 text-blue-600" />
                      <span>💾 LƯU NHÁP</span>
                    </button>
                    <button
                      onClick={() => handleSaveTier1(true)}
                      className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-md shadow-blue-600/20 transition cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCheck className="w-4 h-4" />
                      <span>✅ HOÀN THÀNH ĐÁNH GIÁ</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =======================================================
              FORM 2: TTCM / NGƯỜI PHỤ TRÁCH ĐÁNH GIÁ (Tier 2)
             ======================================================= */}
          {activeTier === 'tier2' && (
            <div className="space-y-4">
              {/* Detailed Form Header Banner (Requirement 3) */}
              <div className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white p-4 rounded-2xl border border-indigo-800 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-indigo-800/80 pb-2.5">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                      PHIẾU ĐÁNH GIÁ KPI CBGVNV – CẤP 2
                    </span>
                    <h3 className="text-base sm:text-lg font-black text-white mt-0.5">
                      ĐÁNH GIÁ KPI – {isTargetOfficeStaff ? 'NGƯỜI PHỤ TRÁCH ĐÁNH GIÁ' : 'TỔ TRƯỞNG / TTCM ĐÁNH GIÁ'}
                    </h3>
                  </div>
                  <div>
                    {renderStatusBadge(ttcmStatus, ttcmScore, personalStatus === 'completed')}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-indigo-300 text-[10px] font-bold uppercase block">Họ và tên & Mã số:</span>
                    <span className="font-extrabold text-white text-sm">{targetStaff.name} ({targetStaff.code})</span>
                  </div>
                  <div>
                    <span className="text-indigo-300 text-[10px] font-bold uppercase block">Chức vụ & Tổ:</span>
                    <span className="font-bold text-white">{targetStaff.position} • {targetStaff.department}</span>
                  </div>
                  <div>
                    <span className="text-indigo-300 text-[10px] font-bold uppercase block">Kỳ & Năm học:</span>
                    <span className="font-bold text-white">Tháng {String(evalMonth).padStart(2, '0')}/{evalYear} • {schoolYear}</span>
                  </div>
                  <div className="bg-white/10 p-2 rounded-xl border border-white/10">
                    <span className="text-amber-300 text-[10px] font-black uppercase block">NGƯỜI ĐANG ĐÁNH GIÁ:</span>
                    <span className="font-black text-white text-xs">{displayTtcmName} – {isTargetOfficeStaff ? 'NGƯỜI PHỤ TRÁCH ĐÁNH GIÁ' : 'TỔ TRƯỞNG ĐÁNH GIÁ'}</span>
                  </div>
                </div>

                <div className="text-xs pt-1 flex items-center justify-between flex-wrap gap-2">
                  <div className="text-indigo-200">
                    {canEditTier2 ? (
                      <span>✅ Quyền thao tác hợp lệ. Hãy nhập điểm đánh giá của cấp tổ (từ 0 đến điểm tối đa) và nhận xét bên dưới.</span>
                    ) : (
                      <span className="text-amber-300 font-bold">🔒 Bạn không có quyền chỉnh sửa phần đánh giá này (Chế độ xem chỉ đọc).</span>
                    )}
                  </div>

                  {canEditTier2 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={handleCopySelfToDept}
                        className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white border border-white/20 font-bold text-xs transition cursor-pointer flex items-center gap-1"
                      >
                        <Copy className="w-3.5 h-3.5 text-indigo-300" />
                        <span>Lấy điểm Tự chấm</span>
                      </button>
                      <button
                        onClick={handleFillMaxDept}
                        className="px-3 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-black text-xs transition cursor-pointer flex items-center gap-1 shadow-xs"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Chấm tối đa (100đ)</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {personalStatus !== 'completed' && (
                <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>Lưu ý:</strong> Cá nhân <strong>{targetStaff.name}</strong> chưa hoàn tất tự đánh giá ({personalScore}đ). Bạn vẫn có thể chấm điểm trước hoặc nhắc cá nhân hoàn thành tự chấm.
                  </span>
                </div>
              )}

              {/* Bảng tiêu chí chi tiết cho TTCM có nhóm tiêu chí */}
              <div className="overflow-x-auto rounded-2xl border-2 border-slate-300 shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-indigo-950 text-white font-extrabold uppercase text-[11px]">
                      <th className="py-3 px-3 w-12 text-center border-r border-indigo-900">STT</th>
                      <th className="py-3 px-3 min-w-[260px] border-r border-indigo-900">NỘI DUNG TIÊU CHÍ ĐÁNH GIÁ</th>
                      <th className="py-3 px-2 w-20 text-center border-r border-indigo-900">TỐI ĐA</th>
                      <th className="py-3 px-2 w-28 text-center bg-blue-950 text-blue-200 border-r border-indigo-900">
                        <div>TỰ CHẤM</div>
                        <div className="text-[10px] text-blue-300 normal-case">({personalScore}đ)</div>
                      </th>
                      <th className="py-3 px-3 w-36 text-center bg-indigo-900 text-white border-r border-indigo-800">
                        <div>TTCM CHẤM</div>
                        <div className="text-[10px] text-indigo-200 normal-case font-semibold">(Nhập trực tiếp)</div>
                      </th>
                      <th className="py-3 px-3 min-w-[220px]">Ý KIẾN / MINH CHỨNG CỦA TỔ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {criteriaList.map((crit, idx) => {
                      const itemScore = scores[crit.id];
                      const selfVal = itemScore?.selfScore !== undefined ? itemScore.selfScore : 0;
                      const deptVal = itemScore?.deptScore !== undefined ? itemScore.deptScore : 0;
                      const prevCrit = idx > 0 ? criteriaList[idx - 1] : null;
                      const isNewSection = !prevCrit || prevCrit.section !== crit.section;

                      return (
                        <React.Fragment key={crit.id}>
                          {isNewSection && (
                            <React.Fragment>
                              {crit.section === 'III.1' && (
                                <tr className="bg-indigo-100/90 border-y border-indigo-300 font-black text-indigo-950 text-xs uppercase tracking-wide">
                                  <td colSpan={5} className="py-2.5 px-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                      <span>III. KẾT QUẢ THỰC HIỆN NHIỆM VỤ</span>
                                      <span className="font-normal normal-case text-indigo-900 text-xs">
                                        Điểm tối đa: 70 | Tổng điểm đã chấm: <strong className="font-black text-indigo-950">{getSectionScoresForTier('dept').III}/70</strong>
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-black text-indigo-950 text-xs bg-indigo-200/90 border-l border-indigo-300">
                                    {getSectionScoresForTier('dept').III} / 70 đ
                                  </td>
                                </tr>
                              )}
                              <tr className="bg-indigo-100/90 border-y border-indigo-300 font-black text-indigo-950 text-xs uppercase tracking-wide">
                                <td colSpan={5} className="py-2.5 px-3">
                                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                    <span>
                                      {crit.section === 'I' && 'I. CHÍNH TRỊ TƯ TƯỞNG, ĐẠO ĐỨC LỐI SỐNG'}
                                      {crit.section === 'II' && 'II. TÁC PHONG, LỀ LỐI LÀM VIỆC, Ý THỨC TỔ CHỨC KỶ LUẬT'}
                                      {crit.section === 'III.1' && 'III.1. NĂNG LỰC VÀ KỸ NĂNG LÀM VIỆC'}
                                      {crit.section === 'III.2' && 'III.2. KẾT QUẢ THỰC HIỆN NHIỆM VỤ ĐƯỢC GIAO'}
                                      {!['I', 'II', 'III.1', 'III.2'].includes(crit.section) && `${crit.section}. ${crit.sectionTitle || crit.groupTitle || ''}`}
                                    </span>
                                    <span className="font-normal normal-case text-indigo-900 text-xs">
                                      {crit.section === 'I' && <>Điểm tối đa: 15 | Tổng điểm đã chấm: <strong className="font-black text-indigo-950">{getSectionScoresForTier('dept').I}/15</strong></>}
                                      {crit.section === 'II' && <>Điểm tối đa: 15 | Tổng điểm đã chấm: <strong className="font-black text-indigo-950">{getSectionScoresForTier('dept').II}/15</strong></>}
                                      {crit.section === 'III.1' && <>Điểm tối đa: 10 | Tổng điểm: <strong className="font-black text-indigo-950">{getSectionScoresForTier('dept').III1}/10</strong></>}
                                      {crit.section === 'III.2' && <>Điểm tối đa: 60 | Tổng điểm: <strong className="font-black text-indigo-950">{getSectionScoresForTier('dept').III2}/60</strong></>}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-right font-black text-indigo-950 text-xs bg-indigo-200/90 border-l border-indigo-300">
                                  {crit.section === 'I' && `${getSectionScoresForTier('dept').I} / 15 đ`}
                                  {crit.section === 'II' && `${getSectionScoresForTier('dept').II} / 15 đ`}
                                  {crit.section === 'III.1' && `${getSectionScoresForTier('dept').III1} / 10 đ`}
                                  {crit.section === 'III.2' && `${getSectionScoresForTier('dept').III2} / 60 đ`}
                                </td>
                              </tr>
                            </React.Fragment>
                          )}
                          <tr className="hover:bg-indigo-50/30 transition">
                            <td className="py-2.5 px-3 text-center font-bold text-slate-400 border-r border-slate-200">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-200">
                              <div className="font-bold text-slate-900 leading-snug">
                                {crit.content}
                              </div>
                              <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                                Mã tiêu chí: {crit.id}
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-center font-black text-slate-700 bg-slate-50 border-r border-slate-200 text-xs">
                              {crit.maxPoints}đ
                            </td>
                            <td className="py-2.5 px-2 text-center font-black text-blue-900 bg-blue-50/40 border-r border-slate-200">
                              {selfVal}đ
                            </td>
                            <td className="py-2 px-3 text-center bg-indigo-50/50 border-r border-slate-200">
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  max={crit.maxPoints}
                                  step="0.5"
                                  disabled={!canEditTier2}
                                  value={itemScore?.deptScore !== undefined ? itemScore.deptScore : ''}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const num = raw === '' ? 0 : parseFloat(raw);
                                    handleScoreChange(crit.id, 'deptScore', isNaN(num) ? 0 : num);
                                  }}
                                  placeholder="0"
                                  className={`w-20 py-1.5 px-2 text-center font-black text-xs rounded-lg border-2 transition focus:outline-none ${
                                    canEditTier2
                                      ? 'text-indigo-950 bg-white border-indigo-400 focus:ring-2 focus:ring-indigo-500 shadow-xs cursor-text'
                                      : 'text-slate-600 bg-slate-100 border-slate-300 cursor-not-allowed'
                                  }`}
                                />
                                <span className="text-[10px] text-slate-400 font-bold">/{crit.maxPoints}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                disabled={!canEditTier2}
                                value={itemScore?.evidence || ''}
                                onChange={(e) => handleEvidenceChange(crit.id, e.target.value)}
                                placeholder={canEditTier2 ? "Ghi nhận đánh giá của tổ chuyên môn..." : (itemScore?.evidence || '—')}
                                className={`w-full py-1 px-2.5 text-xs rounded-lg font-medium border transition focus:outline-none ${
                                  canEditTier2
                                    ? 'bg-white border-slate-300 focus:ring-2 focus:ring-indigo-500 text-slate-800'
                                    : 'bg-slate-50 border-slate-200 text-slate-600 cursor-not-allowed'
                                }`}
                              />
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}

                    {/* HÀNG TỔNG ĐIỂM TTCM */}
                    <tr className="bg-indigo-950 text-white font-black text-xs">
                      <td colSpan={2} className="py-3 px-4 uppercase tracking-wider text-right border-r border-indigo-900">
                        TỔNG ĐIỂM TTCM / PHỤ TRÁCH ĐÁNH GIÁ:
                      </td>
                      <td className="py-3 px-2 text-center text-amber-300 border-r border-indigo-900 font-black">
                        100đ
                      </td>
                      <td className="py-3 px-2 text-center text-blue-200 border-r border-indigo-900 text-sm font-black">
                        {selfComputation.normalizedScore}đ
                      </td>
                      <td className="py-3 px-3 text-center bg-indigo-900 text-amber-300 border-r border-indigo-800 text-base font-black">
                        {deptComputation.normalizedScore}/100 điểm
                      </td>
                      <td className="py-3 px-3 text-indigo-200 italic font-medium">
                        Điểm tổ chuyên môn sẽ được trình Ban Giám hiệu phê duyệt
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Nhận xét của TTCM */}
              <div className="bg-indigo-50/70 p-4 rounded-2xl border border-indigo-200 space-y-2">
                <label className="block text-xs font-bold text-indigo-950 flex items-center justify-between">
                  <span>Ý KIẾN / NHẬN XÉT CỦA TỔ TRƯỞNG / TTCM:</span>
                  <span className="text-indigo-700 font-medium">({displayTtcmName})</span>
                </label>
                <textarea
                  disabled={!canEditTier2}
                  rows={3}
                  value={ttcmComment}
                  onChange={(e) => setTtcmComment(e.target.value)}
                  placeholder="Tổ chuyên môn / Người phụ trách đánh giá tinh thần trách nhiệm, kết quả công tác và xếp loại đề xuất..."
                  className="w-full p-3 text-xs rounded-xl border border-indigo-200 bg-white font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>

              {/* NÚT CHỨC NĂNG FORM TTCM (Requirement 8) */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <X className="w-4 h-4" />
                    <span>✕ ĐÓNG PHIẾU</span>
                  </button>
                  <button
                    onClick={() => setActiveTier('comparison')}
                    className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Layers className="w-4 h-4" />
                    <span>📊 Xem tổng hợp</span>
                  </button>
                </div>

                {canEditTier2 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSaveTier2(false)}
                      className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-indigo-900 border border-indigo-300 font-black text-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    >
                      <Save className="w-4 h-4 text-indigo-600" />
                      <span>💾 LƯU NHÁP</span>
                    </button>
                    <button
                      onClick={() => handleSaveTier2(true)}
                      className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs shadow-md shadow-indigo-600/20 transition cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCheck className="w-4 h-4" />
                      <span>✅ HOÀN THÀNH ĐÁNH GIÁ</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =======================================================
              FORM 3: BGH ĐÁNH GIÁ & DUYỆT (Tier 3)
             ======================================================= */}
          {activeTier === 'tier3' && (
            <div className="space-y-4">
              {/* Detailed Form Header Banner (Requirement 3 & 9) */}
              <div className="bg-gradient-to-r from-purple-900 via-indigo-950 to-slate-900 text-white p-4 rounded-2xl border border-purple-800 shadow-sm space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-purple-800/80 pb-2.5">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                      PHIẾU ĐÁNH GIÁ KPI CBGVNV – CẤP 3 (CHÍNH THỨC)
                    </span>
                    <h3 className="text-base sm:text-lg font-black text-white mt-0.5">
                      BGH ĐÁNH GIÁ & DUYỆT – CHỐT XẾP LOẠI THI ĐUA
                    </h3>
                  </div>
                  <div>
                    {renderStatusBadge(bghStatus, bghScore, ttcmStatus === 'completed')}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-purple-300 text-[10px] font-bold uppercase block">Họ và tên & Mã số:</span>
                    <span className="font-extrabold text-white text-sm">{targetStaff.name} ({targetStaff.code})</span>
                  </div>
                  <div>
                    <span className="text-purple-300 text-[10px] font-bold uppercase block">Chức vụ & Tổ:</span>
                    <span className="font-bold text-white">{targetStaff.position} • {targetStaff.department}</span>
                  </div>
                  <div>
                    <span className="text-purple-300 text-[10px] font-bold uppercase block">Kỳ & Năm học:</span>
                    <span className="font-bold text-white">Tháng {String(evalMonth).padStart(2, '0')}/{evalYear} • {schoolYear}</span>
                  </div>
                  <div className="bg-white/10 p-2 rounded-xl border border-white/10">
                    <span className="text-amber-300 text-[10px] font-black uppercase block">NGƯỜI ĐANG ĐÁNH GIÁ:</span>
                    <span className="font-black text-white text-xs">{displayBghName} – {isTargetBgh ? 'HỘI ĐỒNG ĐÁNH GIÁ & DUYỆT' : 'PHÓ HIỆU TRƯỞNG ĐÁNH GIÁ & DUYỆT'}</span>
                  </div>
                </div>

                <div className="text-xs pt-1 flex items-center justify-between flex-wrap gap-2">
                  <div className="text-purple-200">
                    {canEditTier3 ? (
                      <span>✅ Quyền thao tác hợp lệ. BGH đánh giá, xem điểm đối chiếu của Cá nhân và TTCM, nhập điểm duyệt và chốt xếp loại.</span>
                    ) : (
                      <span className="text-amber-300 font-bold">🔒 Bạn không có quyền chỉnh sửa phần đánh giá này (Chế độ xem chỉ đọc).</span>
                    )}
                  </div>

                  {canEditTier3 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={handleCopyDeptToBgh}
                        className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-white border border-white/20 font-bold text-xs transition cursor-pointer flex items-center gap-1"
                      >
                        <Copy className="w-3.5 h-3.5 text-purple-300" />
                        <span>Duyệt theo điểm TTCM</span>
                      </button>
                      <button
                        onClick={handleFillMaxBgh}
                        className="px-3 py-1.5 rounded-xl bg-purple-500 hover:bg-purple-600 text-white font-black text-xs transition cursor-pointer flex items-center gap-1 shadow-xs"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Duyệt tối đa (100đ)</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {!isBghApprovedReady && (
                <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-black text-amber-950">Quy trình 3 cấp chưa hoàn tất các bước trước:</div>
                    <ul className="list-disc list-inside mt-1 space-y-0.5 text-[11px] text-amber-800">
                      {personalStatus !== 'completed' && (
                        <li>Cá nhân <strong>{targetStaff.name}</strong> chưa hoàn thành tự đánh giá ({personalScore}đ).</li>
                      )}
                      {ttcmStatus !== 'completed' && (
                        <li>Tổ trưởng / TTCM <strong>{displayTtcmName}</strong> chưa hoàn thành đánh giá cấp tổ ({ttcmScore}đ).</li>
                      )}
                    </ul>
                    <div className="mt-1 text-[11px] font-semibold text-amber-900">
                      Bạn có thể lưu nháp điểm BGH trước, và nút &quot;PHÊ DUYỆT & CHỐT XẾP LOẠI&quot; sẽ hoàn tất chốt điểm thi đua.
                    </div>
                  </div>
                </div>
              )}

              {/* Bảng tiêu chí chi tiết cho BGH có nhóm tiêu chí (Requirement 4, 5, 9) */}
              <div className="overflow-x-auto rounded-2xl border-2 border-slate-300 shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-purple-950 text-white font-extrabold uppercase text-[11px]">
                      <th className="py-3 px-3 w-12 text-center border-r border-purple-900">STT</th>
                      <th className="py-3 px-3 min-w-[240px] border-r border-purple-900">NỘI DUNG TIÊU CHÍ ĐÁNH GIÁ</th>
                      <th className="py-3 px-2 w-16 text-center border-r border-purple-900">TỐI ĐA</th>
                      <th className="py-3 px-2 w-24 text-center bg-blue-950 text-blue-200 border-r border-purple-900">
                        <div>CÁ NHÂN</div>
                        <div className="text-[10px] text-blue-300 normal-case">({personalScore}đ)</div>
                      </th>
                      <th className="py-3 px-2 w-24 text-center bg-indigo-950 text-indigo-200 border-r border-purple-900">
                        <div>TTCM</div>
                        <div className="text-[10px] text-indigo-300 normal-case">({ttcmScore}đ)</div>
                      </th>
                      <th className="py-3 px-3 w-36 text-center bg-purple-900 text-white border-r border-purple-800">
                        <div>BGH DUYỆT</div>
                        <div className="text-[10px] text-purple-200 normal-case font-semibold">(Nhập trực tiếp)</div>
                      </th>
                      <th className="py-3 px-3 min-w-[200px]">KẾT LUẬN / GHI CHÚ BGH</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {criteriaList.map((crit, idx) => {
                      const itemScore = scores[crit.id];
                      const selfVal = itemScore?.selfScore !== undefined ? itemScore.selfScore : 0;
                      const deptVal = itemScore?.deptScore !== undefined ? itemScore.deptScore : 0;
                      const bghVal = itemScore?.bghScore !== undefined ? itemScore.bghScore : 0;
                      const prevCrit = idx > 0 ? criteriaList[idx - 1] : null;
                      const isNewSection = !prevCrit || prevCrit.section !== crit.section;

                      return (
                        <React.Fragment key={crit.id}>
                          {isNewSection && (
                            <React.Fragment>
                              {crit.section === 'III.1' && (
                                <tr className="bg-purple-100/90 border-y border-purple-300 font-black text-purple-950 text-xs uppercase tracking-wide">
                                  <td colSpan={5} className="py-2.5 px-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                      <span>III. KẾT QUẢ THỰC HIỆN NHIỆM VỤ</span>
                                      <span className="font-normal normal-case text-purple-900 text-xs">
                                        Điểm tối đa: 70 | Tổng điểm đã chấm: <strong className="font-black text-purple-950">{getSectionScoresForTier('bgh').III}/70</strong>
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-black text-purple-950 text-xs bg-purple-200/90 border-l border-purple-300">
                                    {getSectionScoresForTier('bgh').III} / 70 đ
                                  </td>
                                </tr>
                              )}
                              <tr className="bg-purple-100/90 border-y border-purple-300 font-black text-purple-950 text-xs uppercase tracking-wide">
                                <td colSpan={5} className="py-2.5 px-3">
                                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                    <span>
                                      {crit.section === 'I' && 'I. CHÍNH TRỊ TƯ TƯỞNG, ĐẠO ĐỨC LỐI SỐNG'}
                                      {crit.section === 'II' && 'II. TÁC PHONG, LỀ LỐI LÀM VIỆC, Ý THỨC TỔ CHỨC KỶ LUẬT'}
                                      {crit.section === 'III.1' && 'III.1. NĂNG LỰC VÀ KỸ NĂNG LÀM VIỆC'}
                                      {crit.section === 'III.2' && 'III.2. KẾT QUẢ THỰC HIỆN NHIỆM VỤ ĐƯỢC GIAO'}
                                      {!['I', 'II', 'III.1', 'III.2'].includes(crit.section) && `${crit.section}. ${crit.sectionTitle || crit.groupTitle || ''}`}
                                    </span>
                                    <span className="font-normal normal-case text-purple-900 text-xs">
                                      {crit.section === 'I' && <>Điểm tối đa: 15 | Tổng điểm đã chấm: <strong className="font-black text-purple-950">{getSectionScoresForTier('bgh').I}/15</strong></>}
                                      {crit.section === 'II' && <>Điểm tối đa: 15 | Tổng điểm đã chấm: <strong className="font-black text-purple-950">{getSectionScoresForTier('bgh').II}/15</strong></>}
                                      {crit.section === 'III.1' && <>Điểm tối đa: 10 | Tổng điểm: <strong className="font-black text-purple-950">{getSectionScoresForTier('bgh').III1}/10</strong></>}
                                      {crit.section === 'III.2' && <>Điểm tối đa: 60 | Tổng điểm: <strong className="font-black text-purple-950">{getSectionScoresForTier('bgh').III2}/60</strong></>}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-right font-black text-purple-950 text-xs bg-purple-200/90 border-l border-purple-300">
                                  {crit.section === 'I' && `${getSectionScoresForTier('bgh').I} / 15 đ`}
                                  {crit.section === 'II' && `${getSectionScoresForTier('bgh').II} / 15 đ`}
                                  {crit.section === 'III.1' && `${getSectionScoresForTier('bgh').III1} / 10 đ`}
                                  {crit.section === 'III.2' && `${getSectionScoresForTier('bgh').III2} / 60 đ`}
                                </td>
                              </tr>
                            </React.Fragment>
                          )}
                          <tr key={crit.id} className="hover:bg-purple-50/30 transition">
                            <td className="py-2.5 px-3 text-center font-bold text-slate-400 border-r border-slate-200">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-200">
                              <div className="font-bold text-slate-900 leading-snug">
                                {crit.content}
                              </div>
                              <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                                Mã tiêu chí: {crit.id}
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-center font-black text-slate-700 bg-slate-50 border-r border-slate-200 text-xs">
                              {crit.maxPoints}đ
                            </td>
                            <td className="py-2.5 px-2 text-center font-bold text-blue-900 bg-blue-50/30 border-r border-slate-200">
                              {selfVal}đ
                            </td>
                            <td className="py-2.5 px-2 text-center font-bold text-indigo-950 bg-indigo-50/30 border-r border-slate-200">
                              {deptVal}đ
                            </td>
                            <td className="py-2 px-3 text-center bg-purple-50/50 border-r border-slate-200">
                              <div className="flex items-center justify-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  max={crit.maxPoints}
                                  step="0.5"
                                  disabled={!canEditTier3}
                                  value={itemScore?.bghScore !== undefined ? itemScore.bghScore : ''}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    const num = raw === '' ? 0 : parseFloat(raw);
                                    handleScoreChange(crit.id, 'bghScore', isNaN(num) ? 0 : num);
                                  }}
                                  placeholder="0"
                                  className={`w-20 py-1.5 px-2 text-center font-black text-xs rounded-lg border-2 transition focus:outline-none ${
                                    canEditTier3
                                      ? 'text-purple-950 bg-white border-purple-400 focus:ring-2 focus:ring-purple-500 shadow-xs cursor-text'
                                      : 'text-slate-600 bg-slate-100 border-slate-300 cursor-not-allowed'
                                  }`}
                                />
                                <span className="text-[10px] text-slate-400 font-bold">/{crit.maxPoints}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                disabled={!canEditTier3}
                                value={itemScore?.evidence || ''}
                                onChange={(e) => handleEvidenceChange(crit.id, e.target.value)}
                                placeholder={canEditTier3 ? "Ghi chú kết luận của Ban Giám hiệu..." : (itemScore?.evidence || '—')}
                                className={`w-full py-1 px-2.5 text-xs rounded-lg font-medium border transition focus:outline-none ${
                                  canEditTier3
                                    ? 'bg-white border-slate-300 focus:ring-2 focus:ring-purple-500 text-slate-800'
                                    : 'bg-slate-50 border-slate-200 text-slate-600 cursor-not-allowed'
                                }`}
                              />
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}

                    {/* HÀNG TỔNG ĐIỂM BGH (Requirement 6) */}
                    <tr className="bg-purple-950 text-white font-black text-xs">
                      <td colSpan={2} className="py-3 px-4 uppercase tracking-wider text-right border-r border-purple-900">
                        TỔNG ĐIỂM BAN GIÁM HIỆU DUYỆT:
                      </td>
                      <td className="py-3 px-2 text-center text-amber-300 border-r border-purple-900 font-black">
                        100đ
                      </td>
                      <td className="py-3 px-2 text-center text-blue-200 border-r border-purple-900 text-sm font-black">
                        {selfComputation.normalizedScore}đ
                      </td>
                      <td className="py-3 px-2 text-center text-indigo-200 border-r border-purple-900 text-sm font-black">
                        {deptComputation.normalizedScore}đ
                      </td>
                      <td className="py-3 px-3 text-center bg-purple-900 text-emerald-300 border-r border-purple-800 text-base font-black">
                        {bghComputation.normalizedScore}/100 điểm
                      </td>
                      <td className="py-3 px-3 text-amber-300 font-bold">
                        Xếp loại: {rankingResult.name} ({rankingResult.code})
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Nhận xét & Kết luận của BGH */}
              <div className="bg-purple-50/70 p-4 rounded-2xl border border-purple-200 space-y-2">
                <label className="block text-xs font-bold text-purple-950 flex items-center justify-between">
                  <span>KẾT LUẬN & Ý KIẾN CHỈ ĐẠO CỦA BAN GIÁM HIỆU:</span>
                  <span className="text-purple-700 font-medium">({displayBghName})</span>
                </label>
                <textarea
                  disabled={!canEditTier3}
                  rows={3}
                  value={bghComment}
                  onChange={(e) => setBghComment(e.target.value)}
                  placeholder="Ban Giám hiệu thống nhất nhận xét, biểu dương ưu điểm và chuẩn y kết quả xếp loại thi đua chính thức..."
                  className="w-full p-3 text-xs rounded-xl border border-purple-200 bg-white font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none disabled:bg-slate-50"
                />
              </div>

              {/* NÚT CHỨC NĂNG FORM BGH (Requirement 8 & 9) */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <X className="w-4 h-4" />
                    <span>✕ ĐÓNG PHIẾU</span>
                  </button>
                  <button
                    onClick={() => setActiveTier('comparison')}
                    className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Layers className="w-4 h-4" />
                    <span>📊 Xem tổng hợp</span>
                  </button>
                </div>

                {canEditTier3 && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSaveTier3(false)}
                      className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-purple-900 border border-purple-300 font-black text-xs transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    >
                      <Save className="w-4 h-4 text-purple-600" />
                      <span>💾 LƯU NHÁP</span>
                    </button>

                    <button
                      onClick={() => handleSaveTier3(true)}
                      className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer flex items-center gap-1.5"
                      title="Phê duyệt kết quả và chốt xếp loại thi đua chính thức"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>✅ PHÊ DUYỆT & CHỐT XẾP LOẠI</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* =======================================================
              VIEW 4: BẢNG ĐỐI CHIẾU 3 CẤP (Comparison View)
             ======================================================= */}
          {activeTier === 'comparison' && (
            <div className="space-y-5">
              {/* Comparison Header */}
              <div className="bg-slate-900 p-4 rounded-2xl text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-amber-300 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-4 h-4" />
                    <span>BẢNG ĐỐI CHIẾU ĐÁNH GIÁ 3 CẤP (THPT PHƯƠNG XÁ)</span>
                  </div>
                  <div className="text-sm font-bold text-slate-200 mt-0.5">
                    {targetStaff.name} ({targetStaff.code}) – {targetStaff.department}
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <div className="text-right">
                    <div className="text-slate-400 text-[10px]">Cá nhân:</div>
                    <div className="font-black text-blue-300">{personalScore}/100đ</div>
                  </div>
                  <div className="text-right">
                    <div className="text-slate-400 text-[10px]">TTCM:</div>
                    <div className="font-black text-indigo-300">{ttcmScore}/100đ</div>
                  </div>
                  <div className="text-right">
                    <div className="text-slate-400 text-[10px]">BGH duyệt:</div>
                    <div className="font-black text-emerald-300">{bghScore}/100đ</div>
                  </div>
                </div>
              </div>

              {/* Bảng 3 cột điểm song song */}
              <div className="overflow-x-auto rounded-2xl border-2 border-slate-300 shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white font-extrabold uppercase text-[11px]">
                      <th className="py-3 px-3 w-12 text-center border-r border-slate-800">STT</th>
                      <th className="py-3 px-3 min-w-[260px] border-r border-slate-800">NỘI DUNG TIÊU CHÍ ĐÁNH GIÁ</th>
                      <th className="py-3 px-2 w-16 text-center border-r border-slate-800">TỐI ĐA</th>

                      <th className="py-3 px-2 w-28 text-center bg-blue-900 text-white border-r border-slate-800">
                        <div>① CÁ NHÂN</div>
                        <div className="text-[10px] text-blue-200 normal-case font-semibold truncate max-w-[100px] mx-auto">
                          {targetStaff.name}
                        </div>
                      </th>

                      <th className="py-3 px-2 w-32 text-center bg-indigo-900 text-white border-r border-slate-800">
                        <div>② TTCM</div>
                        <div className="text-[10px] text-indigo-200 normal-case font-semibold truncate max-w-[120px] mx-auto">
                          {displayTtcmName}
                        </div>
                      </th>

                      <th className="py-3 px-2 w-32 text-center bg-purple-900 text-white border-r border-slate-800">
                        <div>③ BGH DUYỆT</div>
                        <div className="text-[10px] text-purple-200 normal-case font-semibold truncate max-w-[120px] mx-auto">
                          {displayBghName}
                        </div>
                      </th>

                      <th className="py-3 px-3 min-w-[200px]">MINH CHỨNG / GIẢI TRÌNH</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {criteriaList.map((crit, idx) => {
                      const itemScore = scores[crit.id];
                      const selfVal = itemScore?.selfScore !== undefined ? itemScore.selfScore : 0;
                      const deptVal = itemScore?.deptScore !== undefined ? itemScore.deptScore : 0;
                      const bghVal = itemScore?.bghScore !== undefined ? itemScore.bghScore : 0;
                      const prevCrit = idx > 0 ? criteriaList[idx - 1] : null;
                      const isNewSection = !prevCrit || prevCrit.section !== crit.section;

                      return (
                        <React.Fragment key={crit.id}>
                          {isNewSection && (
                            <tr className="bg-slate-100 border-y border-slate-300">
                              <td colSpan={7} className="py-2 px-3 font-black text-slate-900 text-xs uppercase tracking-wide">
                                {crit.section}. {crit.sectionTitle || crit.groupTitle || `NHÓM TIÊU CHÍ ${crit.section}`}
                              </td>
                            </tr>
                          )}
                          <tr className="hover:bg-blue-50/20 transition">
                            <td className="py-2.5 px-3 text-center font-bold text-slate-400 border-r border-slate-200">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 border-r border-slate-200">
                              <div className="font-bold text-slate-800 leading-snug">
                                {crit.content}
                              </div>
                              <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                                Mã tiêu chí: {crit.id}
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-center font-bold text-slate-600 bg-slate-50 border-r border-slate-200">
                              {crit.maxPoints}đ
                            </td>
                            <td className="py-2 px-2 text-center font-black text-blue-900 bg-blue-50/40 border-r border-slate-200">
                              {selfVal}đ
                            </td>
                            <td className="py-2 px-2 text-center font-black text-indigo-950 bg-indigo-50/40 border-r border-slate-200">
                              {deptVal}đ
                            </td>
                            <td className="py-2 px-2 text-center font-black text-purple-950 bg-purple-50/40 border-r border-slate-200">
                              {bghVal}đ
                            </td>
                            <td className="py-2 px-3 text-slate-600 italic text-[11px]">
                              {itemScore?.evidence || '—'}
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}

                    {/* HÀNG TỔNG KẾT BẢNG */}
                    <tr className="bg-slate-900 text-white font-black text-xs">
                      <td colSpan={2} className="py-3 px-4 uppercase tracking-wider text-right border-r border-slate-800">
                        TỔNG ĐIỂM ĐÁNH GIÁ (THANG 100 ĐIỂM):
                      </td>
                      <td className="py-3 px-2 text-center text-amber-300 border-r border-slate-800 font-black">
                        100đ
                      </td>
                      <td className="py-3 px-2 text-center bg-blue-950 text-amber-300 border-r border-slate-800 text-sm font-black">
                        {selfComputation.normalizedScore}đ
                      </td>
                      <td className="py-3 px-2 text-center bg-indigo-950 text-amber-300 border-r border-slate-800 text-sm font-black">
                        {deptComputation.normalizedScore}đ
                      </td>
                      <td className="py-3 px-2 text-center bg-purple-950 text-emerald-300 border-r border-slate-800 text-sm font-black">
                        {bghComputation.normalizedScore}đ
                      </td>
                      <td className="py-3 px-3 text-slate-300 italic">
                        Xếp loại: <strong className="text-amber-300">{rankingResult.name}</strong>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 3 Hộp ý kiến nhận xét */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="bg-blue-50/70 p-3.5 rounded-2xl border border-blue-200">
                  <div className="text-xs font-bold text-blue-950 mb-1 flex items-center justify-between">
                    <span>① Ý KIẾN CÁ NHÂN:</span>
                    <span className="text-[10px] text-blue-600">{targetStaff.name}</span>
                  </div>
                  <p className="text-xs text-slate-700 italic bg-white p-2.5 rounded-xl border border-blue-100 min-h-[60px]">
                    {personalComment || 'Chưa có ý kiến nhận xét của cá nhân.'}
                  </p>
                </div>

                <div className="bg-indigo-50/70 p-3.5 rounded-2xl border border-indigo-200">
                  <div className="text-xs font-bold text-indigo-950 mb-1 flex items-center justify-between">
                    <span>② Ý KIẾN TTCM:</span>
                    <span className="text-[10px] text-indigo-600 truncate max-w-[140px]">{displayTtcmName}</span>
                  </div>
                  <p className="text-xs text-slate-700 italic bg-white p-2.5 rounded-xl border border-indigo-100 min-h-[60px]">
                    {ttcmComment || 'Chưa có ý kiến nhận xét của Tổ trưởng/TTCM.'}
                  </p>
                </div>

                <div className="bg-purple-50/70 p-3.5 rounded-2xl border border-purple-200">
                  <div className="text-xs font-bold text-purple-950 mb-1 flex items-center justify-between">
                    <span>③ Ý KIẾN BGH DUYỆT:</span>
                    <span className="text-[10px] text-purple-600 truncate max-w-[140px]">{displayBghName}</span>
                  </div>
                  <p className="text-xs text-slate-700 italic bg-white p-2.5 rounded-xl border border-purple-100 min-h-[60px]">
                    {bghComment || 'Chưa có kết luận của Ban Giám hiệu.'}
                  </p>
                </div>
              </div>

              {/* Kết quả chính thức */}
              <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 p-4 sm:p-5 rounded-2xl text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-amber-300 font-extrabold uppercase tracking-wide">
                    KẾT QUẢ ĐÁNH GIÁ THI ĐUA CHÍNH THỨC
                  </div>
                  <div className="text-lg sm:text-xl font-black text-white mt-0.5">
                    {targetStaff.name} ({targetStaff.code}) – {targetStaff.department}
                  </div>
                  <div className="text-xs text-slate-300 mt-1 flex items-center gap-3 flex-wrap">
                    <span>Điểm Cá nhân: <strong className="text-blue-300">{personalScore}/100đ</strong></span>
                    <span>•</span>
                    <span>Điểm TTCM: <strong className="text-indigo-300">{ttcmScore}/100đ</strong></span>
                    <span>•</span>
                    <span>Điểm BGH chốt: <strong className="text-emerald-300 text-sm">{bghScore}/100đ</strong></span>
                  </div>
                </div>

                <div className="text-left sm:text-right">
                  <div className="text-xs text-slate-400 font-medium">Kết quả xếp loại:</div>
                  <div className="text-base sm:text-lg font-black text-amber-300 mt-0.5 flex items-center sm:justify-end gap-1.5">
                    <Award className="w-5 h-5 text-amber-400" />
                    <span>{rankingResult.isRanked ? rankingResult.name : 'Chờ BGH duyệt & xếp loại'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Lịch sử đánh giá 3 cấp Audit */}
          <div className="pt-2">
            <button
              onClick={() => setShowHistoryTable(!showHistoryTable)}
              className="text-xs font-bold text-slate-600 hover:text-blue-700 flex items-center gap-1.5 transition cursor-pointer"
            >
              <History className="w-4 h-4 text-slate-400" />
              <span>{showHistoryTable ? 'Ẩn lịch sử ghi nhận 3 cấp' : 'Xem lịch sử ghi nhận 3 cấp'}</span>
              {showHistoryTable ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showHistoryTable && (
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 animate-in fade-in">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white font-extrabold uppercase text-[11px]">
                      <th className="py-2.5 px-3 w-32">CẤP ĐÁNH GIÁ</th>
                      <th className="py-2.5 px-3 w-48">NGƯỜI ĐÁNH GIÁ</th>
                      <th className="py-2.5 px-2 w-28 text-center">ĐIỂM SỐ</th>
                      <th className="py-2.5 px-3 w-36">THỜI GIAN</th>
                      <th className="py-2.5 px-3 w-36 text-center">TRẠNG THÁI</th>
                      <th className="py-2.5 px-3">Ý KIẾN / NHẬN XÉT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr className="hover:bg-blue-50/30">
                      <td className="py-2.5 px-3 font-extrabold text-blue-900">① Cá nhân</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{targetStaff.name}</td>
                      <td className="py-2.5 px-2 text-center font-black text-blue-900">{personalScore} / 100đ</td>
                      <td className="py-2.5 px-3 text-slate-600">{personalDate || '24/09/2026'}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${personalStatus === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}`}>
                          {personalStatus === 'completed' ? 'Đã hoàn thành' : 'Đang thực hiện'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 italic">{personalComment || '—'}</td>
                    </tr>
                    <tr className="hover:bg-indigo-50/30">
                      <td className="py-2.5 px-3 font-extrabold text-indigo-900">② {isTargetOfficeStaff ? 'Người phụ trách' : 'TTCM'}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{displayTtcmName}</td>
                      <td className="py-2.5 px-2 text-center font-black text-indigo-900">{ttcmScore} / 100đ</td>
                      <td className="py-2.5 px-3 text-slate-600">{ttcmDate || (ttcmStatus === 'completed' ? '25/09/2026' : '—')}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${ttcmStatus === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {ttcmStatus === 'completed' ? 'Đã hoàn thành' : 'Chờ đánh giá'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 italic">{ttcmComment || '—'}</td>
                    </tr>
                    <tr className="hover:bg-purple-50/30">
                      <td className="py-2.5 px-3 font-extrabold text-purple-900">③ BGH Duyệt</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{displayBghName}</td>
                      <td className="py-2.5 px-2 text-center font-black text-purple-900">{bghScore} / 100đ</td>
                      <td className="py-2.5 px-3 text-slate-600">{bghDate || (bghStatus === 'completed' ? '26/09/2026' : '—')}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${bghStatus === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                          {bghStatus === 'completed' ? 'Đã phê duyệt' : 'Chờ BGH duyệt'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 italic">{bghComment || '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* ========================================================
            4. MODAL BOTTOM FOOTER
           ======================================================== */}
        <div className="bg-slate-50 p-4 sm:p-5 border-t border-slate-200 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-500 font-medium">
            Phiếu KPI CBGVNV • Năm học {schoolYear} • Trường THPT Phương Xá
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition cursor-pointer"
            >
              Đóng
            </button>

            {canEditTier3 && isBghApprovedReady && (
              <button
                onClick={() => handleSaveTier3(true)}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs shadow-md shadow-emerald-600/20 transition cursor-pointer flex items-center gap-1.5"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Phê duyệt & Chốt xếp loại</span>
              </button>
            )}
          </div>
        </div>

      </div>

      {/* RENDER KPI EVALUATION FORM OVERLAY (Requirement 4, 5, 6, 7) */}
      {scoringFormLevel && targetStaff && (
        <KPIEvaluationForm
          evaluationId={
            evaluationRecord?.id ||
            `eval-${targetStaff.id}-${targetType}-${evalPeriod}-${evalPeriod === 'thang' ? evalMonth : 0}-${evalYear}`
          }
          employeeId={targetStaff.id}
          evaluatorId={
            scoringFormLevel === 'self'
              ? targetStaff.id
              : scoringFormLevel === 'ttcm'
              ? ttcmEvaluatorId || 'ttcm-01'
              : bghEvaluatorId || 'bgh-01'
          }
          level={scoringFormLevel}
          onClose={() => setScoringFormLevel(null)}
          onSaved={() => {
            setScoringFormLevel(null);
            const fresh = getEvaluation(targetStaff.id, schoolYear);
            if (fresh) {
              if (onSuccess) onSuccess(fresh);
            }
          }}
        />
      )}
    </div>
  );
};
