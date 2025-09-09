import React from 'react';
import { 
  Modal as HeroUIModal, 
  ModalContent as HeroUIModalContent,
  ModalHeader as HeroUIModalHeader,
  ModalBody as HeroUIModalBody,
  ModalFooter as HeroUIModalFooter 
} from '@heroui/react';
import type { 
  ModalProps, 
  ModalContentProps,
  ModalHeaderProps,
  ModalBodyProps,
  ModalFooterProps 
} from '../../core/types/components';

export const Modal: React.FC<ModalProps> = ({ children, ...props }) => (
  <HeroUIModal {...props}>
    {children}
  </HeroUIModal>
);

export const ModalContent: React.FC<ModalContentProps> = ({ children, ...props }) => (
  <HeroUIModalContent {...props}>
    {children}
  </HeroUIModalContent>
);

export const ModalHeader: React.FC<ModalHeaderProps> = ({ children, ...props }) => (
  <HeroUIModalHeader {...props}>
    {children}
  </HeroUIModalHeader>
);

export const ModalBody: React.FC<ModalBodyProps> = ({ children, ...props }) => (
  <HeroUIModalBody {...props}>
    {children}
  </HeroUIModalBody>
);

export const ModalFooter: React.FC<ModalFooterProps> = ({ children, ...props }) => (
  <HeroUIModalFooter {...props}>
    {children}
  </HeroUIModalFooter>
);