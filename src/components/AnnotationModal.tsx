"use client";
import React, { useState, useEffect } from 'react';
import { Modal, Textarea, Button, Box } from '@mantine/core';
import axios from 'axios';

const MastodonInstanceUrl = 'https://beta.stacky.social:3002';

interface Question {
  questionId: string;
  content: string;
  questionType: 'multipleChoice' | 'freeText';
  choices?: string[];
}

interface AnnotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  stackId: string | null;
}

const AnnotationModal: React.FC<AnnotationModalProps> = ({ isOpen, onClose, stackId }) => {
  const [answers, setAnswers] = useState<{ [questionId: string]: string }>({});
  const [questions, setQuestions] = useState<Question[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    console.log("Fetching questions...");
    const fetchAnnotationQuestions = async () => {
      if (!stackId) return;

      try {
        const response = await axios.get(`${MastodonInstanceUrl}/api/stacks/${stackId}/questions`);
        const data = response.data;
        console.log("Setting questions:", data);
        setQuestions(data);
      } catch (error) {
        console.error('Error fetching annotation questions:', error);
      }
    };

    fetchAnnotationQuestions();
  }, [stackId]);

  useEffect(() => {
    const user = localStorage.getItem('currentUser');
    if (user) {
      const parsedUser = JSON.parse(user);
      setUserId(parsedUser.id);
    }
  }, []);

  useEffect(() => {
    console.log("Questions state updated:", questions);
  }, [questions]);

  const handleTextChange = (questionId: string, text: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: text }));
  };

  const handleCheckboxChange = (questionId: string, choice: string, isChecked: boolean) => {
    const currentAnswers = answers[questionId] ? answers[questionId].split(', ') : [];
    if (isChecked) {
      setAnswers((prev) => ({ ...prev, [questionId]: [...currentAnswers, choice].join(', ') }));
    } else {
      setAnswers((prev) => ({ ...prev, [questionId]: currentAnswers.filter((item) => item !== choice).join(', ') }));
    }
  };

  const handleSubmit = async () => {
    if (!userId || !stackId) {
      console.error('User ID or Stack ID is missing');
      return;
    }

    const requestBody = {
      userId,
      answers: Object.keys(answers).map(questionId => ({
        questionId,
        answer: answers[questionId]
      }))
    };

    try {
      await axios.post(`${MastodonInstanceUrl}/api/stacks/${stackId}/answers`, requestBody, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });
      console.log('answers submitted successfully');
      setAnswers({});
      onClose();
    } catch (error) {
      console.error('error happens:', error);
    }
  };

  return (
    <Modal opened={isOpen} onClose={onClose} title="Annotation">
      {questions.length === 0 && <p>No questions available</p>}
      {questions.map((question) => (
        <div key={question.questionId}>
          <p>{question.content}</p>
          {question.questionType === 'multipleChoice' ? (
            question.choices?.map((choice, index) => (
              <div key={index}>
                <label>
                  <input
                    type="checkbox"
                    value={choice}
                    checked={answers[question.questionId]?.split(', ').includes(choice)}
                    onChange={(e) => handleCheckboxChange(question.questionId, choice, e.target.checked)}
                  />
                  {choice}
                </label>
              </div>
            ))
          ) : (
            <Textarea
              placeholder="Enter your answer"
              value={answers[question.questionId] || ''}
              onChange={(event) => handleTextChange(question.questionId, event.currentTarget.value)}
              autosize
              minRows={3}
            />
          )}
        </div>
      ))}
      <Box mt="md" style={{ textAlign: 'right' }}>
        <Button onClick={handleSubmit}>Submit</Button>
      </Box>
    </Modal>
  );
};

export default AnnotationModal;
