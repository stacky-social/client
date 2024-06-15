import React from 'react';
import { Modal, Textarea, Button, Group, Box } from '@mantine/core';

interface AnnotationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (annotation: string) => void;
}

const AnnotationModal: React.FC<AnnotationModalProps> = ({ isOpen, onClose, onSubmit }) => {
    const [annotation, setAnnotation] = React.useState('');

    const handleSubmit = () => {
        onSubmit(annotation);
        setAnnotation('');
    };

    return (
        <Modal opened={isOpen} onClose={onClose} title="Annotation">
            <Textarea
                placeholder="Enter your annotation"
                value={annotation}
                onChange={(event) => setAnnotation(event.currentTarget.value)}
                autosize
                minRows={3}
            />
            <Box mt="md" style={{ textAlign: 'right' }}>
                <Button onClick={handleSubmit}>Submit</Button>
            </Box>
        </Modal>
    );
};

export default AnnotationModal;
