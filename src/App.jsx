import { Route, Routes } from 'react-router-dom'
import { RequireAuth } from './lib/auth'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import TestEditor from './pages/TestEditor'
import Results from './pages/Results'
import QuestionBank from './pages/QuestionBank'
import StudentEntry from './pages/StudentEntry'
import Exam from './pages/Exam'
import CheckResult from './pages/CheckResult'
import NotFound from './pages/NotFound'

const guard = (el) => <RequireAuth>{el}</RequireAuth>

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/lecturer" element={guard(<Dashboard />)} />
      <Route path="/lecturer/tests/new" element={guard(<TestEditor />)} />
      <Route path="/lecturer/tests/:id" element={guard(<TestEditor />)} />
      <Route path="/lecturer/tests/:id/results" element={guard(<Results />)} />
      <Route path="/lecturer/bank" element={guard(<QuestionBank />)} />
      <Route path="/t/:slug" element={<StudentEntry />} />
      <Route path="/t/:slug/exam" element={<Exam />} />
      <Route path="/t/:slug/result" element={<CheckResult />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
